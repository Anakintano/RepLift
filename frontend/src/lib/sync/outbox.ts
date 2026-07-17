/**
 * Offline-first outbox.
 *
 * Every diary write happens in two steps inside one Dexie transaction:
 *   1. optimistic write to the device `entries` table (UI updates instantly)
 *   2. a mutation with a stable idempotency key is appended to `outbox`
 *
 * A single scheduler drains the outbox FIFO whenever connectivity allows,
 * with exponential backoff on network failure. Server responses:
 *   - applied/duplicate → entry marked synced (idempotency keys make retries
 *     and double-submissions harmless — the server dedupes, we reconcile)
 *   - conflict → entry flagged, both copies stored for the resolution dialog
 *   - rejected → entry flagged failed, kept locally so no data is lost
 *
 * The same code path runs against the mock server today and FastAPI in
 * Phase 2 — only the ApiClient implementation changes.
 */

import { db, type ConflictRow } from '../db';
import { getClient } from '../api/client';
import { isNetworkError } from '../api/problem';
import type { DiaryEntry, MutationOp, QueuedMutation, UUID } from '../api/types';
import { isOnline, onConnectivityChange } from './connectivity';

// ---------- enqueue (called by UI mutations) ----------

async function enqueue(mutation: MutationOp): Promise<void> {
  const qm: QueuedMutation = {
    idempotencyKey: crypto.randomUUID(),
    mutation,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  await db.outbox.put(qm);
}

/** Create a diary entry (id must be a fresh client-generated UUID). */
export async function createEntry(entry: DiaryEntry): Promise<void> {
  await db.transaction('rw', [db.entries, db.outbox], async () => {
    await db.entries.put({ ...entry, syncState: 'pending' });
    await enqueue({ op: 'create', entity: 'diary_entry', data: { ...entry, syncState: undefined } });
  });
  void processOutbox();
}

export async function updateEntry(id: UUID, patch: Partial<DiaryEntry>): Promise<void> {
  await db.transaction('rw', [db.entries, db.outbox], async () => {
    const cur = await db.entries.get(id);
    if (!cur) throw new Error(`Entry ${id} not found locally`);
    const updated = { ...cur, ...patch, id, updatedAt: new Date().toISOString(), syncState: 'pending' as const };
    await db.entries.put(updated as DiaryEntry);
    await enqueue({ op: 'update', entity: 'diary_entry', id, baseRevision: cur.revision, data: { ...patch, updatedAt: updated.updatedAt } });
  });
  void processOutbox();
}

export async function deleteEntry(id: UUID): Promise<void> {
  await db.transaction('rw', [db.entries, db.outbox], async () => {
    const cur = await db.entries.get(id);
    if (!cur) return;
    await db.entries.put({ ...cur, deleted: true, updatedAt: new Date().toISOString(), syncState: 'pending' });
    await enqueue({ op: 'delete', entity: 'diary_entry', id, baseRevision: cur.revision });
  });
  void processOutbox();
}

// ---------- drain ----------

let draining = false;
let backoffTimer: ReturnType<typeof setTimeout> | null = null;

export async function processOutbox(): Promise<void> {
  if (draining || !isOnline()) return;
  const queued = await db.outbox.orderBy('queuedAt').toArray();
  if (queued.length === 0) return;

  draining = true;
  try {
    const client = await getClient();
    const { results } = await client.sync.push(queued);

    for (const result of results) {
      const qm = queued.find((q) => q.idempotencyKey === result.idempotencyKey);
      if (!qm) continue;
      const entryId = qm.mutation.op === 'create' ? qm.mutation.data.id : qm.mutation.id;

      switch (result.status) {
        case 'applied':
        case 'duplicate': {
          await db.transaction('rw', [db.entries, db.outbox], async () => {
            const entry = await db.entries.get(entryId);
            if (entry) {
              if (qm.mutation.op === 'delete') {
                await db.entries.delete(entryId);
              } else {
                await db.entries.put({ ...entry, revision: result.newRevision ?? entry.revision, syncState: 'synced' });
              }
            }
            await db.outbox.delete(qm.idempotencyKey);
          });
          break;
        }
        case 'conflict': {
          await db.transaction('rw', [db.entries, db.outbox, db.conflicts], async () => {
            const local = await db.entries.get(entryId);
            if (local && result.serverEntry) {
              const row: ConflictRow = {
                entryId,
                serverEntry: result.serverEntry,
                localEntry: local,
                detectedAt: new Date().toISOString(),
              };
              await db.conflicts.put(row);
              await db.entries.put({ ...local, syncState: 'conflict' });
            }
            await db.outbox.delete(qm.idempotencyKey);
          });
          break;
        }
        case 'rejected': {
          await db.transaction('rw', [db.entries, db.outbox], async () => {
            const entry = await db.entries.get(entryId);
            if (entry) await db.entries.put({ ...entry, syncState: 'failed' });
            await db.outbox.delete(qm.idempotencyKey);
          });
          break;
        }
      }
    }
  } catch (err) {
    if (isNetworkError(err)) {
      // network flapped mid-push: keep the queue, back off exponentially.
      // Idempotency keys make it safe if the server actually applied them.
      const attempts = Math.min(...queued.map((q) => q.attempts), 8) + 1;
      await Promise.all(
        queued.map((q) => db.outbox.put({ ...q, attempts: q.attempts + 1, lastError: 'network' })),
      );
      scheduleRetry(Math.min(30_000, 1000 * 2 ** attempts));
    } else {
      // server-level failure (e.g. simulated 503): retry sooner, keep queue
      await Promise.all(
        queued.map((q) => db.outbox.put({ ...q, attempts: q.attempts + 1, lastError: err instanceof Error ? err.message : 'unknown' })),
      );
      scheduleRetry(5_000);
    }
  } finally {
    draining = false;
  }
}

function scheduleRetry(delayMs: number) {
  if (backoffTimer) clearTimeout(backoffTimer);
  backoffTimer = setTimeout(() => {
    backoffTimer = null;
    void processOutbox();
  }, delayMs);
}

// ---------- conflict resolution ----------

export type ConflictChoice = 'mine' | 'server';

/**
 * Resolve a conflict:
 * - 'server': adopt the server copy locally; discard the local change.
 * - 'mine':   re-submit the local values as an update based on the SERVER
 *             revision (a new idempotency key — it is a new logical write).
 */
export async function resolveConflict(entryId: UUID, choice: ConflictChoice): Promise<void> {
  const row = await db.conflicts.get(entryId);
  if (!row) return;

  if (choice === 'server') {
    await db.transaction('rw', [db.entries, db.conflicts], async () => {
      await db.entries.put({ ...row.serverEntry, syncState: 'synced' });
      await db.conflicts.delete(entryId);
    });
  } else {
    const { syncState: _s, revision: _r, ...localData } = row.localEntry;
    await db.transaction('rw', [db.entries, db.outbox, db.conflicts], async () => {
      await db.entries.put({ ...row.localEntry, revision: row.serverEntry.revision, syncState: 'pending' });
      await enqueue({
        op: 'update',
        entity: 'diary_entry',
        id: entryId,
        baseRevision: row.serverEntry.revision,
        data: { ...localData, updatedAt: new Date().toISOString() },
      });
      await db.conflicts.delete(entryId);
    });
    void processOutbox();
  }
}

// ---------- hydration (server → device) ----------

/**
 * Pull recent server entries into the device cache. Local copies that are
 * pending/conflicted are never clobbered — the outbox owns them.
 */
export async function hydrateFromServer(fromDate: string, toDate: string): Promise<void> {
  if (!isOnline()) return;
  const client = await getClient();
  const serverEntries = await client.diary.range(fromDate, toDate);
  await db.transaction('rw', [db.entries], async () => {
    for (const se of serverEntries) {
      const local = await db.entries.get(se.id);
      if (local && local.syncState !== 'synced' && local.syncState !== undefined) continue;
      await db.entries.put({ ...se, syncState: 'synced' });
    }
  });
}

// ---------- scheduler ----------

let started = false;

/** Idempotent: wires connectivity + interval draining. Called from SyncManager. */
export function startSyncScheduler(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  onConnectivityChange(() => {
    if (isOnline()) void processOutbox();
  });
  setInterval(() => void processOutbox(), 15_000);
  void processOutbox();
}
