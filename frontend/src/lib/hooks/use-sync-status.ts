"use client";

/** Live sync status for the global indicator + conflict dialog. */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useOnline } from '../sync/connectivity';

export interface SyncStatus {
  online: boolean;
  pending: number;
  failed: number;
  conflicts: number;
  state: 'offline' | 'syncing' | 'conflict' | 'error' | 'synced';
}

export function useSyncStatus(): SyncStatus {
  const online = useOnline();
  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  const failed = useLiveQuery(() => db.entries.where('syncState').equals('failed').count(), [], 0);
  const conflicts = useLiveQuery(() => db.conflicts.count(), [], 0);

  const state: SyncStatus['state'] = !online
    ? 'offline'
    : conflicts > 0
      ? 'conflict'
      : failed > 0
        ? 'error'
        : pending > 0
          ? 'syncing'
          : 'synced';

  return { online, pending, failed, conflicts, state };
}

export function useConflicts() {
  return useLiveQuery(() => db.conflicts.orderBy('detectedAt').toArray(), [], []);
}
