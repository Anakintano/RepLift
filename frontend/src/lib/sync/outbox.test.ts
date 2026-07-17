/**
 * Outbox behavior tests against a scriptable stub of the sync endpoint:
 * optimistic writes, drain-on-success, duplicate replay safety, network
 * failure retention, conflict capture and both resolution paths.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FoodEntry, QueuedMutation, SyncPushResponse } from '../api/types';

// scriptable sync.push implementation, swapped per test
const pushImpl = vi.hoisted(() => ({
  fn: undefined as undefined | ((m: QueuedMutation[]) => Promise<SyncPushResponse>),
}));

vi.mock('../api/client', () => ({
  getClient: async () => ({
    sync: { push: (m: QueuedMutation[]) => pushImpl.fn!(m) },
    diary: { range: async () => [] },
  }),
}));

vi.mock('./connectivity', () => ({
  isOnline: () => true,
  onConnectivityChange: () => () => {},
}));

import { db } from '../db';
import { createEntry, updateEntry, deleteEntry, processOutbox, resolveConflict } from './outbox';

function foodEntry(id: string): FoodEntry {
  const t = '2026-07-16T10:00:00.000Z';
  return {
    id,
    userId: 'me',
    revision: 0,
    date: '2026-07-16',
    loggedAt: t,
    updatedAt: t,
    deleted: false,
    kind: 'food',
    meal: 'lunch',
    foodId: 'food-egg',
    foodVersion: 1,
    foodName: 'Egg',
    quantity: 2,
    unitId: 'u1',
    unitLabel: '1 large egg',
    grams: 100,
    nutrients: { kcal: 155, proteinG: 12.6, carbsG: 1.1, fatG: 10.6 },
  };
}

const applyAll = async (muts: QueuedMutation[]): Promise<SyncPushResponse> => ({
  results: muts.map((m, i) => ({ idempotencyKey: m.idempotencyKey, status: 'applied' as const, newRevision: i + 1 })),
  serverTime: new Date().toISOString(),
});

beforeEach(async () => {
  await Promise.all([db.entries.clear(), db.outbox.clear(), db.conflicts.clear(), db.meta.clear()]);
  pushImpl.fn = applyAll;
});

describe('optimistic writes + drain', () => {
  it('createEntry writes locally as pending and queues one mutation', async () => {
    pushImpl.fn = async () => { throw Object.assign(new Error('offline'), { name: 'NetworkError' }); };
    // NetworkError check uses instanceof — use the real class instead:
    const { NetworkError } = await import('../api/problem');
    pushImpl.fn = async () => { throw new NetworkError(); };

    await createEntry(foodEntry('e1'));
    const local = await db.entries.get('e1');
    expect(local?.syncState).toBe('pending');
    expect(await db.outbox.count()).toBe(1);
  });

  it('drains the queue and marks entries synced with the server revision', async () => {
    await createEntry(foodEntry('e1'));
    await processOutbox();
    expect(await db.outbox.count()).toBe(0);
    const local = await db.entries.get('e1');
    expect(local?.syncState).toBe('synced');
    expect(local?.revision).toBe(1);
  });

  it('duplicate results reconcile exactly like applied (no data loss, no dupe)', async () => {
    pushImpl.fn = async (muts) => ({
      results: muts.map((m) => ({ idempotencyKey: m.idempotencyKey, status: 'duplicate' as const, newRevision: 5 })),
      serverTime: new Date().toISOString(),
    });
    await createEntry(foodEntry('e1'));
    await processOutbox();
    expect(await db.outbox.count()).toBe(0);
    expect((await db.entries.get('e1'))?.revision).toBe(5);
  });
});

describe('failure handling', () => {
  it('keeps the queue intact on network failure and increments attempts', async () => {
    const { NetworkError } = await import('../api/problem');
    pushImpl.fn = async () => { throw new NetworkError(); };
    await createEntry(foodEntry('e1'));
    await processOutbox();
    const queued = await db.outbox.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0].attempts).toBeGreaterThanOrEqual(1);
    expect((await db.entries.get('e1'))?.syncState).toBe('pending'); // still safe locally
  });

  it('rejected mutations mark the entry failed but keep it locally', async () => {
    pushImpl.fn = async (muts) => ({
      results: muts.map((m) => ({ idempotencyKey: m.idempotencyKey, status: 'rejected' as const, error: 'Entry not found' })),
      serverTime: new Date().toISOString(),
    });
    await createEntry(foodEntry('e1'));
    await processOutbox();
    expect(await db.outbox.count()).toBe(0);
    expect((await db.entries.get('e1'))?.syncState).toBe('failed');
  });
});

describe('delete flow', () => {
  it('tombstones locally, then removes after server ack', async () => {
    await createEntry(foodEntry('e1'));
    await processOutbox();
    await deleteEntry('e1');
    expect((await db.entries.get('e1'))?.deleted).toBe(true); // tombstone until ack
    await processOutbox();
    expect(await db.entries.get('e1')).toBeUndefined();
  });
});

describe('conflicts', () => {
  async function makeConflict() {
    await createEntry(foodEntry('e1'));
    await processOutbox(); // synced at rev 1

    const serverCopy = { ...foodEntry('e1'), revision: 2, quantity: 4 };
    pushImpl.fn = async (muts) => ({
      results: muts.map((m) => ({ idempotencyKey: m.idempotencyKey, status: 'conflict' as const, serverEntry: serverCopy })),
      serverTime: new Date().toISOString(),
    });
    await updateEntry('e1', { quantity: 3 });
    await processOutbox();
    return serverCopy;
  }

  it('captures both versions and flags the entry', async () => {
    await makeConflict();
    const row = await db.conflicts.get('e1');
    expect(row).toBeDefined();
    expect((row!.serverEntry as FoodEntry).quantity).toBe(4);
    expect((row!.localEntry as FoodEntry).quantity).toBe(3);
    expect((await db.entries.get('e1'))?.syncState).toBe('conflict');
    expect(await db.outbox.count()).toBe(0); // conflicted mutation is not blindly retried
  });

  it("resolveConflict('server') adopts the server copy", async () => {
    await makeConflict();
    await resolveConflict('e1', 'server');
    const local = await db.entries.get('e1');
    expect((local as FoodEntry).quantity).toBe(4);
    expect(local?.syncState).toBe('synced');
    expect(await db.conflicts.count()).toBe(0);
  });

  it("resolveConflict('mine') re-submits on top of the server revision", async () => {
    await makeConflict();
    pushImpl.fn = async (muts) => {
      // the re-submitted update must be based on the server's revision (2)
      const m = muts[0].mutation;
      expect(m.op).toBe('update');
      if (m.op === 'update') expect(m.baseRevision).toBe(2);
      return {
        results: muts.map((q) => ({ idempotencyKey: q.idempotencyKey, status: 'applied' as const, newRevision: 3 })),
        serverTime: new Date().toISOString(),
      };
    };
    await resolveConflict('e1', 'mine');
    await processOutbox();
    const local = await db.entries.get('e1');
    expect((local as FoodEntry).quantity).toBe(3); // kept mine
    expect(local?.revision).toBe(3);
    expect(local?.syncState).toBe('synced');
    expect(await db.conflicts.count()).toBe(0);
  });
});
