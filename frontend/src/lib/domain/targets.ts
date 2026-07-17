/**
 * Energy-target derivation — Mifflin-St Jeor BMR, activity multipliers,
 * goal-rate adjustment, and macro split. Used by onboarding and goal editing.
 * Real formulas from day one so mock data is internally consistent.
 */

import type { ActivityLevel, GoalType, Sex } from '../api/types';
import { roundHalfUp } from './nutrition';

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (desk job, little exercise)',
  light: 'Lightly active (1–3 workouts/week)',
  moderate: 'Moderately active (3–5 workouts/week)',
  active: 'Active (6–7 workouts/week)',
  very_active: 'Very active (physical job + training)',
};

/** ~7700 kcal per kg of body weight change. */
const KCAL_PER_KG = 7700;
/** Never recommend below these floors (safety guardrail, not medical advice). */
const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

export interface TargetInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  /** desired change rate in kg/week (positive number; sign comes from goalType) */
  weeklyRateKg: number;
}

export interface DerivedTargets {
  bmr: number;
  tdee: number;
  calorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
  waterTargetMl: number;
  /** true when the safety floor clipped the deficit */
  clampedToFloor: boolean;
}

/** Mifflin-St Jeor (1990): 10W + 6.25H − 5A + s, s = +5 male / −161 female. */
export function mifflinStJeor({ sex, ageYears, heightCm, weightKg }: Pick<TargetInput, 'sex' | 'ageYears' | 'heightCm' | 'weightKg'>): number {
  const s = sex === 'male' ? 5 : -161;
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + s;
}

/**
 * Full derivation: BMR → TDEE → goal-adjusted calories → macro split.
 * Macro policy: protein 1.8 g/kg (satiety + muscle retention), fat 25% of
 * calories, carbs fill the remainder. Water: 35 ml/kg rounded to 250 ml.
 */
export function deriveTargets(input: TargetInput): DerivedTargets {
  const bmr = mifflinStJeor(input);
  const tdee = bmr * ACTIVITY_MULTIPLIERS[input.activityLevel];

  const sign = input.goalType === 'lose' ? -1 : input.goalType === 'gain' ? 1 : 0;
  const dailyDelta = (sign * Math.abs(input.weeklyRateKg) * KCAL_PER_KG) / 7;

  const floor = MIN_KCAL[input.sex];
  const raw = tdee + dailyDelta;
  const clampedToFloor = raw < floor;
  const calorieTarget = roundHalfUp(Math.max(raw, floor) / 10) * 10; // nearest 10 kcal

  const proteinTargetG = roundHalfUp(1.8 * input.weightKg);
  const fatTargetG = roundHalfUp((calorieTarget * 0.25) / 9);
  const carbsTargetG = roundHalfUp(Math.max(0, calorieTarget - proteinTargetG * 4 - fatTargetG * 9) / 4);
  const waterTargetMl = roundHalfUp((35 * input.weightKg) / 250) * 250;

  return {
    bmr: roundHalfUp(bmr),
    tdee: roundHalfUp(tdee),
    calorieTarget,
    proteinTargetG,
    carbsTargetG,
    fatTargetG,
    waterTargetMl,
    clampedToFloor,
  };
}

export function ageFromBirthDate(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}
