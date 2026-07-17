/**
 * Mock ApiClient — a faithful in-browser stand-in for the FastAPI backend.
 *
 * It is deliberately NOT a thin stub: it keeps its own "server-side" state
 * (srv_* Dexie tables), enforces idempotency keys and revision-based
 * optimistic concurrency exactly like the Phase-2 backend will, and injects
 * latency / failures / offline behavior from the dev-sim store. The rest of
 * the app cannot tell it apart from a network client — which is the point.
 */

import { db, getMeta, setMeta, DEFAULT_NOTIFICATION_PREFS, DEFAULT_PRIVACY, type ServerEntry } from '../../db';
import { problem, NetworkError } from '../problem';
import type { ApiClient, FoodSearchOptions, RegisterInput } from '../client';
import type {
  AuthTokens,
  DiaryEntry,
  ExportJob,
  Food,
  FoodSearchResult,
  Goal,
  LocalDate,
  NotificationPrefs,
  Page,
  ParsedFoodItem,
  PrivacySettings,
  Profile,
  QueuedMutation,
  Recipe,
  SavedMeal,
  Session,
  SyncPushResult,
  User,
  UUID,
} from '../types';
import { devSim } from '../../stores/dev-sim';
import { isOnline } from '../../sync/connectivity';
import { recipePerServing, nutrientsForServing } from '../../domain/nutrition';
import { computeDaySummary, computeWeeklyReport } from '../../domain/summary';
import { todayIn } from '../../domain/dates';
import { SEED_FOODS, type SeedFood } from './seed/foods';
import { searchFoods, normalize, type PersonalStats } from './search';
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_TIMEZONE,
  DEMO_USER_ID,
  demoGoals,
  demoProfile,
  demoRecipes,
  demoSavedMeals,
  demoUser,
  generateDemoHistory,
} from './seed/demo';

const SEED_FLAG = 'mock:seeded:v1';
const TOKEN_KEY = 'mock:authToken';

// ---------- transport simulation ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function transport(opts: { critical?: boolean } = {}): Promise<void> {
  if (!isOnline()) throw new NetworkError();
  const { latencyMs, failureRate } = devSim.get();
  await sleep(latencyMs * (0.7 + Math.random() * 0.6));
  if (!opts.critical && failureRate > 0 && Math.random() < failureRate) {
    throw problem(503, 'Service unavailable', 'Simulated server failure (dev toolbar). Retry the request.');
  }
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(`replift:${text}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- seeding ----------

let seedPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) seedPromise = seed();
  return seedPromise;
}

async function seed(): Promise<void> {
  if (await getMeta<boolean>(SEED_FLAG)) return;

  const today = todayIn(DEMO_TIMEZONE);

  await db.transaction(
    'rw',
    [db.srv_foods, db.srv_users, db.srv_profiles, db.srv_goals, db.srv_entries, db.srv_recipes, db.srv_savedMeals, db.srv_sessions, db.srv_foodStats, db.srv_prefs, db.meta],
    async () => {
      await db.srv_foods.bulkPut(SEED_FOODS);

      await db.srv_users.put({ ...demoUser, passwordHash: await sha256(DEMO_PASSWORD) });
      await db.srv_profiles.put(demoProfile);
      await db.srv_goals.bulkPut(demoGoals(today));

      const history = generateDemoHistory(today);
      const now = new Date().toISOString();
      await db.srv_entries.bulkPut(history.map((e) => ({ ...e, syncState: undefined, serverUpdatedAt: now })));

      // personal food stats from history (drives frequent/recent + search boost)
      const stats = new Map<string, { count: number; last: string }>();
      for (const e of history) {
        if (e.kind !== 'food') continue;
        const cur = stats.get(e.foodId) ?? { count: 0, last: e.loggedAt };
        stats.set(e.foodId, { count: cur.count + 1, last: e.loggedAt > cur.last ? e.loggedAt : cur.last });
      }
      await db.srv_foodStats.bulkPut(
        [...stats.entries()].map(([foodId, s]) => ({
          id: `${DEMO_USER_ID}:${foodId}`,
          userId: DEMO_USER_ID,
          foodId,
          logCount: s.count,
          lastLoggedAt: s.last,
        })),
      );

      // recipes with computed per-serving nutrition
      const foodsById = new Map(SEED_FOODS.map((f) => [f.id, f]));
      const recipes = demoRecipes().map((r) => ({
        ...r,
        perServing: recipePerServing(
          r.ingredients.map((i) => ({ grams: i.grams, per100: foodsById.get(i.foodId)!.nutrients })),
          r.servings,
        ),
      }));
      await db.srv_recipes.bulkPut(recipes);
      await db.srv_savedMeals.bulkPut(demoSavedMeals());

      await db.srv_sessions.bulkPut([
        { id: 'sess-1', device: 'Chrome on Windows (this device)', ip: '103.86.xx.xx', lastActiveAt: now, createdAt: '2026-07-01T10:00:00Z', current: true },
        { id: 'sess-2', device: 'RepLift iOS · iPhone 15', ip: '103.86.xx.xx', lastActiveAt: '2026-07-14T19:22:00Z', createdAt: '2026-06-02T08:30:00Z', current: false },
      ]);

      await db.srv_prefs.put({ key: `${DEMO_USER_ID}:notifications`, value: DEFAULT_NOTIFICATION_PREFS });
      await db.srv_prefs.put({ key: `${DEMO_USER_ID}:privacy`, value: DEFAULT_PRIVACY });

      await db.meta.put({ key: SEED_FLAG, value: true });
    },
  );
}

// ---------- auth helpers ----------

async function currentUserId(): Promise<UUID> {
  const token = await getMeta<{ userId: UUID }>(TOKEN_KEY);
  if (!token) throw problem(401, 'Not authenticated', 'Please log in again.');
  return token.userId;
}

function tokens(): AuthTokens {
  return { accessToken: `mock-${crypto.randomUUID()}`, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
}

async function catalog(): Promise<SeedFood[]> {
  const foods = (await db.srv_foods.toArray()) as SeedFood[];
  return foods.map((f) => ({ ...f, popularity: f.popularity ?? 25 }));
}

async function personalStats(userId: UUID): Promise<PersonalStats> {
  const rows = await db.srv_foodStats.where('userId').equals(userId).toArray();
  return { counts: new Map(rows.map((r) => [r.foodId, r.logCount])) };
}

// ---------- sync (the important part) ----------

async function applyMutation(userId: UUID, qm: QueuedMutation): Promise<SyncPushResult> {
  const { idempotencyKey, mutation } = qm;

  const existing = await db.srv_idempotency.get(idempotencyKey);
  if (existing) {
    const stored = JSON.parse(existing.result) as SyncPushResult;
    return { ...stored, status: 'duplicate' };
  }

  const now = new Date().toISOString();
  let result: SyncPushResult;

  if (mutation.op === 'create') {
    const dup = await db.srv_entries.get(mutation.data.id);
    if (dup) {
      // same client id resent without its key (e.g. after storage loss) — still no duplicate row
      result = { idempotencyKey, status: 'duplicate', newRevision: dup.revision };
    } else {
      const entry: ServerEntry = { ...mutation.data, userId, revision: 1, syncState: undefined, serverUpdatedAt: now };
      await db.srv_entries.put(entry);
      if (entry.kind === 'food') {
        const statId = `${userId}:${entry.foodId}`;
        const stat = await db.srv_foodStats.get(statId);
        await db.srv_foodStats.put({
          id: statId,
          userId,
          foodId: entry.foodId,
          logCount: (stat?.logCount ?? 0) + 1,
          lastLoggedAt: now,
        });
      }
      result = { idempotencyKey, status: 'applied', newRevision: 1 };
    }
  } else {
    const entry = await db.srv_entries.get(mutation.id);
    if (!entry || (entry.deleted && mutation.op === 'update')) {
      result = { idempotencyKey, status: 'rejected', error: 'Entry not found' };
    } else if (entry.revision !== mutation.baseRevision) {
      const { serverUpdatedAt: _s, ...serverEntry } = entry;
      result = { idempotencyKey, status: 'conflict', serverEntry: serverEntry as DiaryEntry };
    } else if (mutation.op === 'update') {
      const updated = { ...entry, ...mutation.data, id: entry.id, revision: entry.revision + 1, updatedAt: now, serverUpdatedAt: now } as ServerEntry;
      await db.srv_entries.put(updated);
      result = { idempotencyKey, status: 'applied', newRevision: updated.revision };
    } else {
      await db.srv_entries.put({ ...entry, deleted: true, revision: entry.revision + 1, updatedAt: now, serverUpdatedAt: now });
      result = { idempotencyKey, status: 'applied', newRevision: entry.revision + 1 };
    }
  }

  await db.srv_idempotency.put({ idempotencyKey, result: JSON.stringify(result), createdAt: now });
  return result;
}

// ---------- NL food parsing (deterministic fallback parser) ----------

const QTY_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5, quarter: 0.25 };

function parseSegment(segment: string): { quantity: number; unit: string | null; name: string } | null {
  const text = normalize(segment);
  if (!text) return null;
  const tokens = text.split(' ');
  let quantity = 1;
  let idx = 0;

  const numMatch = tokens[0]?.match(/^(\d+(?:\.\d+)?)(?:\/(\d+))?$/);
  if (numMatch) {
    quantity = numMatch[2] ? Number(numMatch[1]) / Number(numMatch[2]) : Number(numMatch[1]);
    idx = 1;
  } else if (tokens[0] in QTY_WORDS) {
    quantity = QTY_WORDS[tokens[0]];
    idx = 1;
  }

  const UNITS = ['g', 'gram', 'grams', 'ml', 'cup', 'cups', 'tbsp', 'tsp', 'slice', 'slices', 'scoop', 'scoops', 'oz', 'bowl', 'plate', 'glass', 'piece', 'pieces', 'large', 'medium', 'small', 'can', 'bar'];
  let unit: string | null = null;
  if (idx < tokens.length && UNITS.includes(tokens[idx])) {
    unit = tokens[idx];
    idx += 1;
    if (tokens[idx] === 'of') idx += 1;
  }

  const name = tokens.slice(idx).join(' ').trim();
  if (!name) return null;
  return { quantity, unit, name };
}

// ---------- the client ----------

export async function createMockClient(): Promise<ApiClient> {
  await ensureSeeded();

  const client: ApiClient = {
    auth: {
      async register(input: RegisterInput) {
        await transport();
        const email = input.email.toLowerCase().trim();
        if (await db.srv_users.where('email').equals(email).first()) {
          throw problem(409, 'Email already registered', 'Try logging in instead.', { email: 'This email already has an account.' });
        }
        const user: User = {
          id: crypto.randomUUID(),
          email,
          displayName: input.displayName.trim(),
          createdAt: new Date().toISOString(),
          emailVerified: false,
        };
        await db.srv_users.put({ ...user, passwordHash: await sha256(input.password) });
        await setMeta(TOKEN_KEY, { userId: user.id });
        return { user, tokens: tokens() };
      },

      async login(email: string, password: string) {
        await transport();
        const row = await db.srv_users.where('email').equals(email.toLowerCase().trim()).first();
        if (!row || row.passwordHash !== (await sha256(password))) {
          throw problem(401, 'Invalid credentials', 'Email or password is incorrect.');
        }
        await setMeta(TOKEN_KEY, { userId: row.id });
        const { passwordHash: _p, ...user } = row;
        return { user, tokens: tokens() };
      },

      async logout() {
        await db.meta.delete(TOKEN_KEY);
      },

      async requestPasswordReset(_email: string) {
        await transport();
        // mock: always succeeds without revealing whether the email exists
      },

      async me() {
        const token = await getMeta<{ userId: UUID }>(TOKEN_KEY);
        if (!token) return null;
        const row = await db.srv_users.get(token.userId);
        if (!row) return null;
        const { passwordHash: _p, ...user } = row;
        return user;
      },

      async sessions() {
        await transport();
        await currentUserId();
        return db.srv_sessions.toArray();
      },

      async revokeSession(id: UUID) {
        await transport();
        const s = await db.srv_sessions.get(id);
        if (s?.current) throw problem(400, 'Cannot revoke current session', 'Log out instead.');
        await db.srv_sessions.delete(id);
      },
    },

    profile: {
      async get() {
        await transport();
        const userId = await currentUserId();
        const p = await db.srv_profiles.get(userId);
        if (!p) throw problem(404, 'Profile not found', 'Complete onboarding first.');
        return p;
      },
      async update(patch: Partial<Profile>) {
        await transport();
        const userId = await currentUserId();
        const cur = (await db.srv_profiles.get(userId)) ?? ({ userId } as Profile);
        const next = { ...cur, ...patch, userId };
        await db.srv_profiles.put(next);
        return next;
      },
    },

    goals: {
      async current() {
        await transport();
        const userId = await currentUserId();
        const all = await db.srv_goals.where('userId').equals(userId).sortBy('effectiveDate');
        const g = all[all.length - 1];
        if (!g) throw problem(404, 'No goal set', 'Complete onboarding first.');
        return g;
      },
      async history() {
        await transport();
        const userId = await currentUserId();
        return (await db.srv_goals.where('userId').equals(userId).sortBy('effectiveDate')).reverse();
      },
      async create(goal) {
        await transport();
        const userId = await currentUserId();
        const g: Goal = { ...goal, id: crypto.randomUUID(), userId, createdAt: new Date().toISOString() };
        await db.srv_goals.put(g);
        return g;
      },
    },

    foods: {
      async search(query: string, opts: FoodSearchOptions = {}): Promise<Page<FoodSearchResult>> {
        await transport();
        const userId = await currentUserId();
        const page = opts.page ?? 1;
        const pageSize = opts.pageSize ?? 20;
        const all = searchFoods(await catalog(), query, await personalStats(userId));
        const mine = opts.includeMine !== false ? all : all.filter((r) => r.food.createdBy !== userId);
        const start = (page - 1) * pageSize;
        return { items: mine.slice(start, start + pageSize), total: mine.length, page, pageSize, hasMore: start + pageSize < mine.length };
      },

      async get(id: UUID) {
        await transport();
        const f = await db.srv_foods.get(id);
        if (!f) throw problem(404, 'Food not found');
        return f;
      },

      async create(input) {
        await transport();
        const userId = await currentUserId();
        const f: Food & { popularity: number } = {
          ...input,
          id: crypto.randomUUID(),
          version: 1,
          source: 'user',
          verification: 'unverified',
          createdBy: userId,
          createdAt: new Date().toISOString(),
          popularity: 10,
        };
        await db.srv_foods.put(f);
        return f;
      },

      async recent(limit = 12) {
        await transport();
        const userId = await currentUserId();
        const stats = await db.srv_foodStats.where('userId').equals(userId).toArray();
        stats.sort((a, b) => b.lastLoggedAt.localeCompare(a.lastLoggedAt));
        const foods = await db.srv_foods.bulkGet(stats.slice(0, limit).map((s) => s.foodId));
        return foods.filter((f): f is Food => !!f);
      },

      async frequent(limit = 12) {
        await transport();
        const userId = await currentUserId();
        const stats = await db.srv_foodStats.where('userId').equals(userId).toArray();
        stats.sort((a, b) => b.logCount - a.logCount);
        const foods = await db.srv_foods.bulkGet(stats.slice(0, limit).map((s) => s.foodId));
        return foods.filter((f): f is Food => !!f);
      },
    },

    recipes: {
      async list() {
        await transport();
        const userId = await currentUserId();
        return db.srv_recipes.where('userId').equals(userId).toArray();
      },
      async get(id: UUID) {
        await transport();
        const userId = await currentUserId();
        const r = await db.srv_recipes.get(id);
        if (!r || r.userId !== userId) throw problem(404, 'Recipe not found');
        return r;
      },
      async create(input) {
        await transport();
        const userId = await currentUserId();
        const foods = await db.srv_foods.bulkGet(input.ingredients.map((i) => i.foodId));
        const perServing = recipePerServing(
          input.ingredients.map((i, idx) => ({ grams: i.grams, per100: foods[idx]!.nutrients })),
          input.servings,
        );
        const now = new Date().toISOString();
        const r: Recipe = { ...input, id: crypto.randomUUID(), userId, revision: 1, perServing, createdAt: now, updatedAt: now };
        await db.srv_recipes.put(r);
        return r;
      },
      async update(id, revision, patch) {
        await transport();
        const userId = await currentUserId();
        const cur = await db.srv_recipes.get(id);
        if (!cur || cur.userId !== userId) throw problem(404, 'Recipe not found');
        if (cur.revision !== revision) throw problem(409, 'Recipe was modified elsewhere', 'Reload and reapply your changes.');
        const next: Recipe = { ...cur, ...patch, revision: cur.revision + 1, updatedAt: new Date().toISOString() };
        const foods = await db.srv_foods.bulkGet(next.ingredients.map((i) => i.foodId));
        next.perServing = recipePerServing(
          next.ingredients.map((i, idx) => ({ grams: i.grams, per100: foods[idx]!.nutrients })),
          next.servings,
        );
        await db.srv_recipes.put(next);
        return next;
      },
      async remove(id: UUID) {
        await transport();
        const userId = await currentUserId();
        const cur = await db.srv_recipes.get(id);
        if (cur && cur.userId === userId) await db.srv_recipes.delete(id);
      },
    },

    savedMeals: {
      async list() {
        await transport();
        const userId = await currentUserId();
        return db.srv_savedMeals.where('userId').equals(userId).toArray();
      },
      async create(input) {
        await transport();
        const userId = await currentUserId();
        const m: SavedMeal = { ...input, id: crypto.randomUUID(), userId, revision: 1, createdAt: new Date().toISOString() };
        await db.srv_savedMeals.put(m);
        return m;
      },
      async remove(id: UUID) {
        await transport();
        const userId = await currentUserId();
        const cur = await db.srv_savedMeals.get(id);
        if (cur && cur.userId === userId) await db.srv_savedMeals.delete(id);
      },
    },

    diary: {
      async day(date: LocalDate) {
        await transport();
        const userId = await currentUserId();
        const rows = await db.srv_entries.where('date').equals(date).toArray();
        return rows.filter((e) => e.userId === userId && !e.deleted).map(({ serverUpdatedAt: _s, ...e }) => e as DiaryEntry);
      },
      async range(from: LocalDate, to: LocalDate) {
        await transport();
        const userId = await currentUserId();
        const rows = await db.srv_entries.where('date').between(from, to, true, true).toArray();
        return rows.filter((e) => e.userId === userId && !e.deleted).map(({ serverUpdatedAt: _s, ...e }) => e as DiaryEntry);
      },
      async summary(date: LocalDate) {
        await transport();
        const userId = await currentUserId();
        const rows = (await db.srv_entries.where('date').equals(date).toArray()).filter((e) => e.userId === userId);
        const goal = await client.goals.current();
        return computeDaySummary(date, rows as DiaryEntry[], goal);
      },
    },

    sync: {
      async push(mutations: QueuedMutation[]) {
        await transport({ critical: true });
        const userId = await currentUserId();
        const results: SyncPushResult[] = [];
        for (const qm of mutations) {
          results.push(await applyMutation(userId, qm));
        }
        return { results, serverTime: new Date().toISOString() };
      },
    },

    reports: {
      async weekly(weekStart: LocalDate) {
        await transport();
        const userId = await currentUserId();
        const rows = (await db.srv_entries.toArray()).filter((e) => e.userId === userId);
        const goal = await client.goals.current();
        return computeWeeklyReport(weekStart, rows as DiaryEntry[], goal);
      },
    },

    ai: {
      async parseFoodLog(text: string) {
        await transport();
        const userId = await currentUserId();
        // Simulate AI provider latency / outage: outage degrades, never errors.
        if (devSim.get().aiDown) {
          return { items: [], degraded: true };
        }
        await sleep(700);

        const segments = text.split(/,| and | with | plus |\n/i).filter((s) => s.trim());
        const cat = await catalog();
        const personal = await personalStats(userId);
        const items: ParsedFoodItem[] = [];

        for (const seg of segments.slice(0, 8)) {
          const parsed = parseSegment(seg);
          if (!parsed) continue;
          const results = searchFoods(cat, parsed.name, personal);
          const match = results[0] ?? null;
          const confidence: ParsedFoodItem['confidence'] =
            match && match.score >= 70 ? 'high' : match && match.score >= 35 ? 'medium' : 'low';
          items.push({ rawText: seg.trim(), name: parsed.name, quantity: parsed.quantity, unit: parsed.unit, match, confidence });
        }

        return { items, degraded: false };
      },
    },

    account: {
      async getNotificationPrefs() {
        await transport();
        const userId = await currentUserId();
        return ((await db.srv_prefs.get(`${userId}:notifications`))?.value as NotificationPrefs) ?? DEFAULT_NOTIFICATION_PREFS;
      },
      async updateNotificationPrefs(prefs: NotificationPrefs) {
        await transport();
        const userId = await currentUserId();
        await db.srv_prefs.put({ key: `${userId}:notifications`, value: prefs });
        return prefs;
      },
      async getPrivacy() {
        await transport();
        const userId = await currentUserId();
        return ((await db.srv_prefs.get(`${userId}:privacy`))?.value as PrivacySettings) ?? DEFAULT_PRIVACY;
      },
      async updatePrivacy(settings: PrivacySettings) {
        await transport();
        const userId = await currentUserId();
        await db.srv_prefs.put({ key: `${userId}:privacy`, value: settings });
        return settings;
      },

      async requestExport() {
        await transport();
        await currentUserId();
        const job: ExportJob = { id: crypto.randomUUID(), status: 'queued', requestedAt: new Date().toISOString(), progressPct: 0 };
        await db.srv_exports.put(job);
        return job;
      },

      /** Each poll advances the "background job" — mirrors Phase-2 job polling. */
      async exportStatus(id: UUID) {
        await transport();
        const userId = await currentUserId();
        const job = await db.srv_exports.get(id);
        if (!job) throw problem(404, 'Export not found');
        if (job.status === 'done' || job.status === 'failed') return job;

        const next: ExportJob = { ...job, status: 'running', progressPct: Math.min(100, job.progressPct + 34) };
        if (next.progressPct >= 100) {
          const [entries, recipes, profile, goals] = await Promise.all([
            db.srv_entries.toArray().then((r) => r.filter((e) => e.userId === userId)),
            db.srv_recipes.where('userId').equals(userId).toArray(),
            db.srv_profiles.get(userId),
            db.srv_goals.where('userId').equals(userId).toArray(),
          ]);
          const payload = JSON.stringify({ exportedAt: new Date().toISOString(), profile, goals, recipes, entries }, null, 2);
          next.status = 'done';
          next.completedAt = new Date().toISOString();
          next.downloadUrl = `data:application/json;charset=utf-8,${encodeURIComponent(payload)}`;
        }
        await db.srv_exports.put(next);
        return next;
      },

      async deleteAccount(password: string) {
        await transport();
        const userId = await currentUserId();
        const row = await db.srv_users.get(userId);
        if (!row || row.passwordHash !== (await sha256(password))) {
          throw problem(403, 'Password incorrect', 'Account deletion requires your current password.');
        }
        // Immediate: credentials + sessions. (Phase 2 purges the rest async.)
        await db.transaction('rw', [db.srv_users, db.srv_sessions, db.srv_entries, db.srv_recipes, db.srv_savedMeals, db.srv_goals, db.srv_profiles, db.srv_foodStats, db.meta], async () => {
          await db.srv_users.delete(userId);
          await db.srv_sessions.clear();
          await db.srv_entries.where('userId').equals(userId).delete();
          await db.srv_recipes.where('userId').equals(userId).delete();
          await db.srv_savedMeals.where('userId').equals(userId).delete();
          await db.srv_goals.where('userId').equals(userId).delete();
          await db.srv_profiles.delete(userId);
          await db.srv_foodStats.where('userId').equals(userId).delete();
          await db.meta.delete(TOKEN_KEY);
        });
        // wipe device copy too
        await Promise.all([db.entries.clear(), db.outbox.clear(), db.conflicts.clear()]);
      },
    },
  };

  return client;
}

// ---------- dev-only helpers (chaos toolbar) ----------

/**
 * Simulate another device editing a recent food entry on the SERVER:
 * bumps its revision so the next local edit of that entry conflicts.
 * Returns the edited entry id (or null if there was nothing to edit).
 */
export async function simulateOtherDeviceEdit(): Promise<string | null> {
  const token = await getMeta<{ userId: UUID }>(TOKEN_KEY);
  if (!token) return null;
  const rows = (await db.srv_entries.toArray())
    .filter((e) => e.userId === token.userId && e.kind === 'food' && !e.deleted)
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const target = rows[0];
  if (!target || target.kind !== 'food') return null;
  const now = new Date().toISOString();
  const factor = target.quantity === 2 ? 3 : 2;
  const edited: ServerEntry = {
    ...target,
    quantity: target.quantity * factor,
    grams: target.grams * factor,
    nutrients: Object.fromEntries(
      Object.entries(target.nutrients).map(([k, v]) => [k, (v as number) * factor]),
    ) as unknown as typeof target.nutrients,
    revision: target.revision + 1,
    updatedAt: now,
    serverUpdatedAt: now,
  };
  await db.srv_entries.put(edited);
  return target.id;
}

/** Full reset: wipe the mock server AND device state, then reseed. */
export async function resetDemoData(): Promise<void> {
  seedPromise = null;
  await db.delete();
  await db.open();
  await ensureSeeded();
}
