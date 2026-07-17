/**
 * IndexedDB layout (Dexie).
 *
 * Two logical halves in one database:
 *
 * 1. DEVICE tables — the offline-first client state every phase uses:
 *    - entries: local copy of diary entries (source of truth for the UI)
 *    - outbox:  queued mutations awaiting sync (idempotency keys, attempts)
 *    - meta:    kv (deviceId, lastSyncAt, auth token)
 *
 * 2. srv_* tables — the SIMULATED backend used only by the Phase-1 mock
 *    client (lib/api/mock). They stand in for Postgres: separate copy of
 *    entries with server-side revisions, an idempotency-key table, users,
 *    foods, recipes… Phase 2 deletes nothing — these tables simply stop
 *    being used when the HTTP client is active.
 */

import Dexie, { type EntityTable } from 'dexie';
import type {
  DiaryEntry,
  ExportJob,
  Food,
  Goal,
  NotificationPrefs,
  PrivacySettings,
  Profile,
  QueuedMutation,
  Recipe,
  SavedMeal,
  Session,
  User,
  UUID,
} from './api/types';

export interface MetaRow {
  key: string;
  value: unknown;
}

/** A detected sync conflict awaiting user resolution. */
export interface ConflictRow {
  entryId: UUID;
  /** the server's current copy at detection time */
  serverEntry: DiaryEntry;
  /** the local copy the user tried to sync */
  localEntry: DiaryEntry;
  detectedAt: string;
}

/** Server-side copy of a diary entry (mock backend). */
export type ServerEntry = DiaryEntry & { serverUpdatedAt: string };

export interface ServerIdempotencyRow {
  idempotencyKey: UUID;
  /** serialized SyncPushResult returned the first time */
  result: string;
  createdAt: string;
}

export interface ServerUserRow extends User {
  passwordHash: string;
}

/** Per-user food log counts driving the "frequent foods" personal boost. */
export interface ServerFoodStatRow {
  id: string; // `${userId}:${foodId}`
  userId: UUID;
  foodId: UUID;
  logCount: number;
  lastLoggedAt: string;
}

const db = new Dexie('replift') as Dexie & {
  // device tables
  entries: EntityTable<DiaryEntry, 'id'>;
  outbox: EntityTable<QueuedMutation, 'idempotencyKey'>;
  conflicts: EntityTable<ConflictRow, 'entryId'>;
  meta: EntityTable<MetaRow, 'key'>;
  // simulated backend (Phase 1 only)
  srv_entries: EntityTable<ServerEntry, 'id'>;
  srv_idempotency: EntityTable<ServerIdempotencyRow, 'idempotencyKey'>;
  srv_users: EntityTable<ServerUserRow, 'id'>;
  srv_profiles: EntityTable<Profile, 'userId'>;
  srv_goals: EntityTable<Goal, 'id'>;
  srv_foods: EntityTable<Food, 'id'>;
  srv_recipes: EntityTable<Recipe, 'id'>;
  srv_savedMeals: EntityTable<SavedMeal, 'id'>;
  srv_sessions: EntityTable<Session, 'id'>;
  srv_foodStats: EntityTable<ServerFoodStatRow, 'id'>;
  srv_prefs: EntityTable<MetaRow, 'key'>; // notification/privacy per user
  srv_exports: EntityTable<ExportJob, 'id'>;
};

db.version(1).stores({
  entries: 'id, date, kind, [date+kind], syncState, updatedAt',
  outbox: 'idempotencyKey, queuedAt',
  conflicts: 'entryId, detectedAt',
  meta: 'key',
  srv_entries: 'id, date, kind, [date+kind], updatedAt',
  srv_idempotency: 'idempotencyKey, createdAt',
  srv_users: 'id, &email',
  srv_profiles: 'userId',
  srv_goals: 'id, userId, effectiveDate',
  srv_foods: 'id, name, source, createdBy',
  srv_recipes: 'id, userId',
  srv_savedMeals: 'id, userId',
  srv_sessions: 'id',
  srv_foodStats: 'id, userId, logCount',
  srv_prefs: 'key',
  srv_exports: 'id',
});

export { db };

// ---------- meta helpers ----------

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Stable per-browser device id (used in session labels + entry provenance). */
export async function getDeviceId(): Promise<string> {
  let id = await getMeta<string>('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    await setMeta('deviceId', id);
  }
  return id;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  mealReminders: true,
  waterReminders: false,
  weeklyReportEmail: true,
  weighInReminder: true,
};

export const DEFAULT_PRIVACY: PrivacySettings = {
  analyticsOptOut: false,
  aiFeaturesEnabled: true,
};
