/**
 * API contract types — mirror the eventual FastAPI /api/v1 resources.
 * The mock layer and the real HTTP client both implement `ApiClient` (client.ts)
 * against these shapes, so Phase 2 swaps transport without touching screens.
 *
 * Conventions (matching the backend):
 * - ids are UUIDs generated client-side for offline-created entities
 * - timestamps are ISO 8601 UTC strings
 * - dates (diary days) are `YYYY-MM-DD` strings in the *user's* timezone
 * - every mutable entity carries `revision` for optimistic concurrency
 */

// ---------- Shared ----------

export type UUID = string;
export type ISODateTime = string; // 2026-07-16T09:30:00Z
export type LocalDate = string; // 2026-07-16 (user-tz diary day)

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** RFC 7807-style error the backend returns; mock layer produces the same. */
export interface ApiProblem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  /** field -> message, for 422 validation errors */
  errors?: Record<string, string>;
}

// ---------- Auth & account ----------

export interface User {
  id: UUID;
  email: string;
  displayName: string;
  createdAt: ISODateTime;
  emailVerified: boolean;
}

export interface AuthTokens {
  accessToken: string;
  /** refresh token travels as httpOnly cookie in Phase 2; mock keeps it in memory */
  expiresAt: ISODateTime;
}

export interface Session {
  id: UUID;
  device: string;
  ip: string;
  lastActiveAt: ISODateTime;
  createdAt: ISODateTime;
  current: boolean;
}

// ---------- Profile, goals, targets ----------

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type GoalType = 'lose' | 'maintain' | 'gain';
export type UnitSystem = 'metric' | 'imperial';

export interface Profile {
  userId: UUID;
  sex: Sex;
  birthDate: LocalDate;
  heightCm: number;
  activityLevel: ActivityLevel;
  unitSystem: UnitSystem;
  timezone: string; // IANA
  onboardingCompleted: boolean;
}

/** Goals are versioned — editing creates a new row effective from `effectiveDate`. */
export interface Goal {
  id: UUID;
  userId: UUID;
  goalType: GoalType;
  /** target rate in kg/week, signed (negative = lose) */
  weeklyRateKg: number;
  targetWeightKg?: number;
  calorieTarget: number; // kcal/day
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  waterTargetMl: number;
  effectiveDate: LocalDate;
  createdAt: ISODateTime;
}

// ---------- Foods & nutrition ----------

/** Per-100g (or per-100ml for liquids) nutrient values. All optional except energy/macros. */
export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  sugarG?: number;
  satFatG?: number;
  sodiumMg?: number;
  potassiumMg?: number;
  calciumMg?: number;
  ironMg?: number;
  vitaminCMg?: number;
  cholesterolMg?: number;
}

export type FoodSource = 'usda' | 'user' | 'branded' | 'recipe';
export type VerificationStatus = 'verified' | 'community' | 'unverified';

/** A serving unit a food can be logged in, with its gram (or ml) weight. */
export interface ServingUnit {
  id: UUID;
  label: string; // "1 large egg", "1 cup", "1 slice"
  grams: number; // weight of ONE unit
}

/**
 * Immutable food version. Log entries reference `foodId` + `version`;
 * corrections create a new version and never rewrite past diary history.
 */
export interface Food {
  id: UUID;
  version: number;
  name: string;
  brand?: string;
  source: FoodSource;
  verification: VerificationStatus;
  /** nutrients per 100 g (solids) or 100 ml (isLiquid) */
  nutrients: Nutrients;
  isLiquid: boolean;
  servingUnits: ServingUnit[];
  /** default serving for quick-log */
  defaultServing: { unitId: UUID | 'g'; quantity: number };
  createdBy?: UUID; // for user foods
  createdAt: ISODateTime;
}

export interface FoodSearchResult {
  food: Food;
  score: number;
  /** explainable ranking breakdown (mirrors backend response) */
  explain: {
    textScore: number;
    popularityBoost: number;
    personalBoost: number;
    fuzzy: boolean;
  };
}

// ---------- Recipes & saved meals ----------

export interface RecipeIngredient {
  id: UUID;
  foodId: UUID;
  foodVersion: number;
  /** denormalized snapshot for display without extra fetches */
  foodName: string;
  quantity: number;
  unitId: UUID | 'g';
  grams: number; // resolved weight of this ingredient line
}

export interface Recipe {
  id: UUID;
  userId: UUID;
  revision: number;
  name: string;
  description?: string;
  servings: number; // recipe yields N servings
  ingredients: RecipeIngredient[];
  /** computed per-serving nutrients (derived, never stored authoritative on client) */
  perServing: Nutrients;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** A saved meal = reusable bundle of diary items (e.g. "my usual breakfast"). */
export interface SavedMeal {
  id: UUID;
  userId: UUID;
  revision: number;
  name: string;
  items: Array<{
    foodId: UUID;
    foodVersion: number;
    foodName: string;
    quantity: number;
    unitId: UUID | 'g';
    grams: number;
    nutrients: Nutrients; // resolved for the given quantity
  }>;
  createdAt: ISODateTime;
}

// ---------- Diary (the sync-critical aggregate) ----------

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export type SyncState = 'synced' | 'pending' | 'failed' | 'conflict';

interface DiaryEntryBase {
  id: UUID;
  userId: UUID;
  revision: number;
  date: LocalDate;
  loggedAt: ISODateTime;
  updatedAt: ISODateTime;
  deleted?: boolean;
  /** client-only decoration, never sent to server */
  syncState?: SyncState;
}

export interface FoodEntry extends DiaryEntryBase {
  kind: 'food';
  meal: MealSlot;
  foodId: UUID;
  foodVersion: number;
  foodName: string; // snapshot
  brand?: string;
  quantity: number;
  unitId: UUID | 'g';
  unitLabel: string; // snapshot
  grams: number;
  nutrients: Nutrients; // resolved snapshot for this entry
}

export interface WaterEntry extends DiaryEntryBase {
  kind: 'water';
  amountMl: number;
}

export type ExerciseCategory = 'cardio' | 'strength' | 'flexibility' | 'sports' | 'other';

export interface ExerciseEntry extends DiaryEntryBase {
  kind: 'exercise';
  name: string;
  category: ExerciseCategory;
  durationMin: number;
  caloriesBurned: number;
  distanceKm?: number;
  sets?: number;
  reps?: number;
  weightKg?: number;
  notes?: string;
}

export interface WeightEntry extends DiaryEntryBase {
  kind: 'weight';
  weightKg: number;
}

export type MeasurementSite = 'waist' | 'hips' | 'chest' | 'left_arm' | 'right_arm' | 'left_thigh' | 'right_thigh' | 'neck' | 'body_fat_pct';

export interface MeasurementEntry extends DiaryEntryBase {
  kind: 'measurement';
  site: MeasurementSite;
  /** cm for girths, % for body_fat_pct */
  value: number;
}

export type DiaryEntry = FoodEntry | WaterEntry | ExerciseEntry | WeightEntry | MeasurementEntry;
export type DiaryEntryKind = DiaryEntry['kind'];

// ---------- Daily summary (server-computed in Phase 2; mock computes locally) ----------

export interface DaySummary {
  date: LocalDate;
  consumed: Nutrients;
  burnedExercise: number;
  waterMl: number;
  goal: Pick<Goal, 'calorieTarget' | 'proteinTargetG' | 'carbsTargetG' | 'fatTargetG' | 'waterTargetMl'>;
  /** calorieTarget - consumed.kcal + burnedExercise */
  remainingKcal: number;
  entryCount: number;
}

// ---------- Sync protocol ----------

export type MutationOp =
  | { op: 'create'; entity: 'diary_entry'; data: DiaryEntry }
  | { op: 'update'; entity: 'diary_entry'; id: UUID; baseRevision: number; data: Partial<DiaryEntry> }
  | { op: 'delete'; entity: 'diary_entry'; id: UUID; baseRevision: number };

export interface QueuedMutation {
  /** idempotency key — unique per logical mutation, stable across retries */
  idempotencyKey: UUID;
  mutation: MutationOp;
  queuedAt: ISODateTime;
  attempts: number;
  lastError?: string;
}

export interface SyncPushResult {
  idempotencyKey: UUID;
  status: 'applied' | 'duplicate' | 'conflict' | 'rejected';
  /** server's current copy, present on conflict so the client can offer resolution */
  serverEntry?: DiaryEntry;
  newRevision?: number;
  error?: string;
}

export interface SyncPushResponse {
  results: SyncPushResult[];
  serverTime: ISODateTime;
}

// ---------- Reports & notifications ----------

export interface WeeklyReport {
  weekStart: LocalDate; // Monday
  weekEnd: LocalDate;
  avgKcal: number;
  avgProteinG: number;
  avgCarbsG: number;
  avgFatG: number;
  avgWaterMl: number;
  daysLogged: number;
  weightChangeKg: number | null;
  exerciseSessions: number;
  exerciseMinutes: number;
  caloriesBurned: number;
  adherencePct: number; // % of days within ±10% of calorie target
  bestDay: LocalDate | null;
  perDay: Array<{ date: LocalDate; kcal: number; target: number }>;
}

export interface NotificationPrefs {
  mealReminders: boolean;
  waterReminders: boolean;
  weeklyReportEmail: boolean;
  weighInReminder: boolean;
}

export interface PrivacySettings {
  analyticsOptOut: boolean;
  aiFeaturesEnabled: boolean;
}

// ---------- AI: natural-language food logging ----------

export interface ParsedFoodItem {
  rawText: string; // "2 eggs"
  name: string; // "egg"
  quantity: number;
  unit: string | null; // "large", "cup", null = default serving
  /** resolved via food search; null when no confident match */
  match: FoodSearchResult | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface ParseFoodLogResponse {
  items: ParsedFoodItem[];
  /** true when AI unavailable/timeout and caller should fall back to manual search */
  degraded: boolean;
}

// ---------- Data export / account ----------

export interface ExportJob {
  id: UUID;
  status: 'queued' | 'running' | 'done' | 'failed';
  requestedAt: ISODateTime;
  completedAt?: ISODateTime;
  downloadUrl?: string;
  progressPct: number;
}
