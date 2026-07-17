/**
 * ApiClient — the single contract between UI and data layer.
 *
 * Phase 1: `MockClient` (lib/api/mock) implements this against an in-browser
 * "server" with simulated latency/failures. Phase 2: an HTTP implementation
 * hits FastAPI /api/v1 with identical semantics. Screens never know which.
 *
 * Diary WRITES do not appear here: they go through the offline outbox
 * (lib/sync/outbox.ts), which delivers them via `sync.push`.
 */

import type {
  AuthTokens,
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

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface FoodSearchOptions {
  page?: number;
  pageSize?: number;
  /** include user's own foods/recipes */
  includeMine?: boolean;
}

export interface ApiClient {
  auth: {
    register(input: RegisterInput): Promise<{ user: User; tokens: AuthTokens }>;
    login(email: string, password: string): Promise<{ user: User; tokens: AuthTokens }>;
    logout(): Promise<void>;
    requestPasswordReset(email: string): Promise<void>;
    me(): Promise<User | null>;
    sessions(): Promise<Session[]>;
    revokeSession(id: UUID): Promise<void>;
  };

  profile: {
    get(): Promise<Profile>;
    update(patch: Partial<Profile>): Promise<Profile>;
  };

  goals: {
    current(): Promise<Goal>;
    history(): Promise<Goal[]>;
    /** goals are versioned: editing creates a new goal effective today */
    create(goal: Omit<Goal, 'id' | 'userId' | 'createdAt'>): Promise<Goal>;
  };

  foods: {
    search(query: string, opts?: FoodSearchOptions): Promise<Page<FoodSearchResult>>;
    get(id: UUID, version?: number): Promise<Food>;
    create(food: Omit<Food, 'id' | 'version' | 'createdAt' | 'createdBy' | 'source' | 'verification'>): Promise<Food>;
    recent(limit?: number): Promise<Food[]>;
    frequent(limit?: number): Promise<Food[]>;
  };

  recipes: {
    list(): Promise<Recipe[]>;
    get(id: UUID): Promise<Recipe>;
    create(recipe: Omit<Recipe, 'id' | 'userId' | 'revision' | 'perServing' | 'createdAt' | 'updatedAt'>): Promise<Recipe>;
    update(id: UUID, revision: number, patch: Partial<Pick<Recipe, 'name' | 'description' | 'servings' | 'ingredients'>>): Promise<Recipe>;
    remove(id: UUID): Promise<void>;
  };

  savedMeals: {
    list(): Promise<SavedMeal[]>;
    create(meal: Omit<SavedMeal, 'id' | 'userId' | 'revision' | 'createdAt'>): Promise<SavedMeal>;
    remove(id: UUID): Promise<void>;
  };

  /** Diary reads. Writes go through the outbox → sync.push. */
  diary: {
    day(date: LocalDate): Promise<DiaryEntry[]>;
    range(from: LocalDate, to: LocalDate): Promise<DiaryEntry[]>;
    summary(date: LocalDate): Promise<DaySummary>;
  };

  sync: {
    push(mutations: QueuedMutation[]): Promise<SyncPushResponse>;
  };

  reports: {
    weekly(weekStart: LocalDate): Promise<WeeklyReport>;
  };

  ai: {
    parseFoodLog(text: string): Promise<ParseFoodLogResponse>;
  };

  account: {
    getNotificationPrefs(): Promise<NotificationPrefs>;
    updateNotificationPrefs(prefs: NotificationPrefs): Promise<NotificationPrefs>;
    getPrivacy(): Promise<PrivacySettings>;
    updatePrivacy(settings: PrivacySettings): Promise<PrivacySettings>;
    requestExport(): Promise<ExportJob>;
    exportStatus(id: UUID): Promise<ExportJob>;
    deleteAccount(password: string): Promise<void>;
  };
}

let clientPromise: Promise<ApiClient> | null = null;

/**
 * Lazily resolve the active client. Env-switched so Phase 2 flips
 * NEXT_PUBLIC_API_MODE=http without touching any screen code.
 */
export function getClient(): Promise<ApiClient> {
  if (!clientPromise) {
    clientPromise =
      process.env.NEXT_PUBLIC_API_MODE === 'http'
        ? import('./http').then((m) => m.createHttpClient())
        : import('./mock').then((m) => m.createMockClient());
  }
  return clientPromise;
}
