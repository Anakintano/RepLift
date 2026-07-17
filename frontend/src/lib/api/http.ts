/**
 * HTTP implementation of ApiClient against FastAPI /api/v1.
 *
 * Calls are same-origin (Next.js rewrites proxy /api/v1 → backend), so auth
 * cookies flow automatically. 401s trigger one silent refresh-and-retry.
 * Network failures throw NetworkError so the outbox keeps queueing offline.
 */

import type { ApiClient, FoodSearchOptions, RegisterInput } from './client';
import { ApiError, NetworkError } from './problem';
import type {
  DaySummary,
  DiaryEntry,
  ExportJob,
  Food,
  FoodSearchResult,
  Goal,
  LocalDate,
  NotificationPrefs,
  Page,
  ParseFoodLogResponse,
  PrivacySettings,
  Profile,
  QueuedMutation,
  Recipe,
  SavedMeal,
  Session,
  SyncPushResponse,
  User,
  UUID,
  WeeklyReport,
} from './types';

const BASE = '/api/v1';

interface ReqOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** skip the automatic refresh-retry (used by auth endpoints themselves) */
  noRetry?: boolean;
}

async function rawFetch(path: string, opts: ReqOptions): Promise<Response> {
  const url = new URL(BASE + path, window.location.origin);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  try {
    return await fetch(url, {
      method: opts.method ?? 'GET',
      credentials: 'same-origin',
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new NetworkError();
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = rawFetch('/auth/refresh', { method: 'POST', noRetry: true })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => setTimeout(() => (refreshing = null), 0));
  }
  return refreshing;
}

async function req<T>(path: string, opts: ReqOptions = {}): Promise<T> {
  let res = await rawFetch(path, opts);
  if (res.status === 401 && !opts.noRetry && (await tryRefresh())) {
    res = await rawFetch(path, opts);
  }
  if (!res.ok) {
    let problem;
    try {
      const body = await res.json();
      problem = body.detail && typeof body.detail === 'object' ? body.detail : body;
    } catch {
      problem = { type: 'about:blank', title: res.statusText, status: res.status };
    }
    throw new ApiError({ status: res.status, title: 'Request failed', type: 'about:blank', ...problem });
  }
  if (res.status === 204 || res.status === 202) {
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  return (await res.json()) as T;
}

export function createHttpClient(): ApiClient {
  return {
    auth: {
      register: (input: RegisterInput) => req('/auth/register', { method: 'POST', body: input, noRetry: true }),
      login: (email, password) => req('/auth/login', { method: 'POST', body: { email, password }, noRetry: true }),
      logout: () => req<void>('/auth/logout', { method: 'POST', noRetry: true }),
      requestPasswordReset: (email) => req<void>('/auth/password-reset', { method: 'POST', body: { email }, noRetry: true }),
      me: () => req<User | null>('/auth/me'),
      sessions: () => req<Session[]>('/auth/sessions'),
      revokeSession: (id: UUID) => req<void>(`/auth/sessions/${id}`, { method: 'DELETE' }),
    },

    profile: {
      get: () => req<Profile>('/profile'),
      update: (patch) => req<Profile>('/profile', { method: 'PATCH', body: patch }),
    },

    goals: {
      current: () => req<Goal>('/goals/current'),
      history: () => req<Goal[]>('/goals'),
      create: (goal) => req<Goal>('/goals', { method: 'POST', body: goal }),
    },

    foods: {
      search: (query: string, opts: FoodSearchOptions = {}) =>
        req<Page<FoodSearchResult>>('/foods/search', {
          query: { q: query, page: opts.page, pageSize: opts.pageSize },
        }),
      get: (id: UUID, version?: number) => req<Food>(`/foods/${id}`, { query: { version } }),
      create: (food) => req<Food>('/foods', { method: 'POST', body: food }),
      recent: (limit = 12) => req<Food[]>('/foods/recent', { query: { limit } }),
      frequent: (limit = 12) => req<Food[]>('/foods/frequent', { query: { limit } }),
    },

    recipes: {
      list: () => req<Recipe[]>('/recipes'),
      get: (id: UUID) => req<Recipe>(`/recipes/${id}`),
      create: (recipe) => req<Recipe>('/recipes', { method: 'POST', body: recipe }),
      update: (id, revision, patch) => req<Recipe>(`/recipes/${id}`, { method: 'PATCH', body: patch, query: { revision } }),
      remove: (id: UUID) => req<void>(`/recipes/${id}`, { method: 'DELETE' }),
    },

    savedMeals: {
      list: () => req<SavedMeal[]>('/saved-meals'),
      create: (meal) => req<SavedMeal>('/saved-meals', { method: 'POST', body: meal }),
      remove: (id: UUID) => req<void>(`/saved-meals/${id}`, { method: 'DELETE' }),
    },

    diary: {
      day: (date: LocalDate) => req<DiaryEntry[]>(`/diary/${date}`),
      range: (from: LocalDate, to: LocalDate) => req<DiaryEntry[]>('/diary', { query: { from, to } }),
      summary: (date: LocalDate) => req<DaySummary>(`/diary/${date}/summary`),
    },

    sync: {
      push: (mutations: QueuedMutation[]) =>
        req<SyncPushResponse>('/sync/push', { method: 'POST', body: { mutations } }),
    },

    reports: {
      weekly: (weekStart: LocalDate) => req<WeeklyReport>(`/reports/weekly/${weekStart}`),
    },

    ai: {
      parseFoodLog: (text: string) => req<ParseFoodLogResponse>('/ai/parse-food-log', { method: 'POST', body: { text } }),
    },

    account: {
      getNotificationPrefs: () => req<NotificationPrefs>('/account/notifications'),
      updateNotificationPrefs: (prefs) => req<NotificationPrefs>('/account/notifications', { method: 'PUT', body: prefs }),
      getPrivacy: () => req<PrivacySettings>('/account/privacy'),
      updatePrivacy: (settings) => req<PrivacySettings>('/account/privacy', { method: 'PUT', body: settings }),
      requestExport: () => req<ExportJob>('/account/exports', { method: 'POST' }),
      exportStatus: (id: UUID) => req<ExportJob>(`/account/exports/${id}`),
      deleteAccount: (password: string) => req<void>('/account/delete', { method: 'POST', body: { password } }),
    },
  };
}
