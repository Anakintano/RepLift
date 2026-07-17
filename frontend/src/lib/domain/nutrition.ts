/**
 * Nutrition calculation engine — pure, deterministic, side-effect free.
 *
 * All business rules for turning (food, quantity, unit) into nutrients and
 * aggregating them live HERE, never in components. Phase 2 mirrors this
 * module in Python; both run the same test vectors (see nutrition.test.ts).
 *
 * Rounding policy (explicit, applied nowhere else):
 * - Internal math is full-precision floating point.
 * - `roundNutrients` is applied only at persistence/presentation boundaries:
 *   kcal → nearest integer; macros/micros → 1 decimal; mg values → nearest integer.
 * - Half-up rounding (0.5 → 1), matching what users expect from labels.
 */

import type { Food, Nutrients, RecipeIngredient } from '../api/types';

// ---------- Rounding ----------

/** Deterministic half-up rounding to `dp` decimals (avoids JS toFixed quirks). */
export function roundHalfUp(value: number, dp = 0): number {
  const f = 10 ** dp;
  // EPSILON nudge so values like 2.675 (stored as 2.67499...) round as printed
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
}

const INT_FIELDS: (keyof Nutrients)[] = ['kcal', 'sodiumMg', 'potassiumMg', 'calciumMg', 'cholesterolMg'];

export function roundNutrients(n: Nutrients): Nutrients {
  const out = {} as Record<string, number>;
  for (const [k, v] of Object.entries(n)) {
    if (v === undefined || v === null) continue;
    out[k] = roundHalfUp(v, INT_FIELDS.includes(k as keyof Nutrients) ? 0 : 1);
  }
  return out as unknown as Nutrients;
}

// ---------- Unit resolution ----------

/**
 * Resolve a logged (quantity, unit) to grams.
 * `unitId === 'g'` means raw grams (or ml for liquids — same 1:1 basis).
 * Throws on unknown unit ids or non-finite/negative quantities: the caller
 * (form validation) should have prevented both, and silently guessing would
 * corrupt health records.
 */
export function resolveGrams(food: Pick<Food, 'servingUnits'>, quantity: number, unitId: string): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError(`Invalid quantity: ${quantity}`);
  }
  if (unitId === 'g') return quantity;
  const unit = food.servingUnits.find((u) => u.id === unitId);
  if (!unit) throw new RangeError(`Unknown serving unit '${unitId}'`);
  return quantity * unit.grams;
}

// ---------- Scaling ----------

/**
 * Scale per-100g nutrients to a gram weight. Missing optional nutrients stay
 * missing (undefined) — we never invent zeros for unknown micronutrient data,
 * so totals can distinguish "0 mg" from "not measured".
 */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const factor = grams / 100;
  const out = {} as Record<string, number>;
  for (const [k, v] of Object.entries(per100)) {
    if (v === undefined || v === null) continue;
    out[k] = v * factor;
  }
  return out as unknown as Nutrients;
}

/** Nutrients for logging `quantity` × `unitId` of `food`. Rounded for persistence. */
export function nutrientsForServing(food: Food, quantity: number, unitId: string): { grams: number; nutrients: Nutrients } {
  const grams = resolveGrams(food, quantity, unitId);
  return { grams, nutrients: roundNutrients(scaleNutrients(food.nutrients, grams)) };
}

// ---------- Aggregation ----------

const EMPTY: Nutrients = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/**
 * Sum nutrient snapshots. Core macros always sum (default 0);
 * optional micros sum only when at least one input reports them.
 */
export function sumNutrients(items: Nutrients[]): Nutrients {
  const out: Record<string, number> = { ...EMPTY };
  for (const n of items) {
    for (const [k, v] of Object.entries(n)) {
      if (v === undefined || v === null) continue;
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out as unknown as Nutrients;
}

// ---------- Recipes ----------

/**
 * Per-serving nutrients of a recipe: sum of resolved ingredient snapshots ÷ servings.
 * Ingredient lines carry their own resolved `grams` and reference an immutable
 * food version, so this is reproducible even after the source food is corrected.
 */
export function recipePerServing(
  ingredients: Array<Pick<RecipeIngredient, 'grams'> & { per100: Nutrients }>,
  servings: number,
): Nutrients {
  if (!Number.isFinite(servings) || servings <= 0) {
    throw new RangeError(`Recipe servings must be > 0, got ${servings}`);
  }
  const total = sumNutrients(ingredients.map((i) => scaleNutrients(i.per100, i.grams)));
  const perServing: Record<string, number> = {};
  for (const [k, v] of Object.entries(total)) perServing[k] = (v as number) / servings;
  return roundNutrients(perServing as unknown as Nutrients);
}

// ---------- Daily budget ----------

export interface DayBudgetInput {
  calorieTarget: number;
  consumedKcal: number;
  exerciseBurnedKcal: number;
  /** whether exercise burn credits back into the budget (user setting) */
  creditExercise: boolean;
}

export function remainingKcal({ calorieTarget, consumedKcal, exerciseBurnedKcal, creditExercise }: DayBudgetInput): number {
  const credit = creditExercise ? exerciseBurnedKcal : 0;
  return roundHalfUp(calorieTarget - consumedKcal + credit);
}

/** Progress toward a target, clamped to [0, 1] for rings/bars. Never NaN. */
export function progressPct(value: number, target: number): number {
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.min(1, Math.max(0, value / target));
}

// ---------- Display helpers (pure formatting, no locale side effects) ----------

export function formatGrams(g: number): string {
  return `${roundHalfUp(g, g < 10 ? 1 : 0)} g`;
}

export function formatKcal(kcal: number): string {
  return `${roundHalfUp(kcal).toLocaleString('en-US')} kcal`;
}
