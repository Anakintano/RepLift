import { describe, expect, it } from 'vitest';
import {
  roundHalfUp,
  resolveGrams,
  scaleNutrients,
  nutrientsForServing,
  sumNutrients,
  recipePerServing,
  remainingKcal,
  progressPct,
} from './nutrition';
import type { Food, Nutrients } from '../api/types';

const egg: Food = {
  id: 'food-egg',
  version: 1,
  name: 'Egg, whole, cooked',
  source: 'usda',
  verification: 'verified',
  nutrients: { kcal: 155, proteinG: 12.6, carbsG: 1.1, fatG: 10.6, cholesterolMg: 373 },
  isLiquid: false,
  servingUnits: [
    { id: 'u-large', label: '1 large egg', grams: 50 },
    { id: 'u-medium', label: '1 medium egg', grams: 44 },
  ],
  defaultServing: { unitId: 'u-large', quantity: 1 },
  createdAt: '2026-01-01T00:00:00Z',
};

describe('roundHalfUp', () => {
  it('rounds half up at integer boundary', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.4)).toBe(2);
    expect(roundHalfUp(-2.4)).toBe(-2);
  });

  it('handles binary-float edge cases deterministically', () => {
    expect(roundHalfUp(2.675, 2)).toBe(2.68); // naive Math.round gives 2.67
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
  });
});

describe('resolveGrams', () => {
  it('resolves household units to grams', () => {
    expect(resolveGrams(egg, 2, 'u-large')).toBe(100);
    expect(resolveGrams(egg, 0.5, 'u-medium')).toBe(22);
  });

  it("passes raw grams through for unitId 'g'", () => {
    expect(resolveGrams(egg, 137, 'g')).toBe(137);
  });

  it('rejects unknown units and invalid quantities instead of guessing', () => {
    expect(() => resolveGrams(egg, 1, 'u-nope')).toThrow(RangeError);
    expect(() => resolveGrams(egg, -1, 'g')).toThrow(RangeError);
    expect(() => resolveGrams(egg, Number.NaN, 'g')).toThrow(RangeError);
    expect(() => resolveGrams(egg, Number.POSITIVE_INFINITY, 'g')).toThrow(RangeError);
  });
});

describe('scaleNutrients', () => {
  it('scales linearly from per-100g', () => {
    const n = scaleNutrients(egg.nutrients, 50);
    expect(n.kcal).toBeCloseTo(77.5);
    expect(n.proteinG).toBeCloseTo(6.3);
  });

  it('never invents zeros for missing micronutrients', () => {
    const sparse: Nutrients = { kcal: 100, proteinG: 10, carbsG: 5, fatG: 2 };
    const scaled = scaleNutrients(sparse, 200);
    expect(scaled.fiberG).toBeUndefined();
    expect(scaled.sodiumMg).toBeUndefined();
  });
});

describe('nutrientsForServing (shared test vectors — Phase 2 Python must match)', () => {
  it('2 large eggs = 100 g', () => {
    const { grams, nutrients } = nutrientsForServing(egg, 2, 'u-large');
    expect(grams).toBe(100);
    expect(nutrients.kcal).toBe(155);
    expect(nutrients.proteinG).toBe(12.6);
    expect(nutrients.cholesterolMg).toBe(373); // integer-rounded field
  });

  it('decimal quantity: 1.5 medium eggs', () => {
    const { grams, nutrients } = nutrientsForServing(egg, 1.5, 'u-medium');
    expect(grams).toBe(66);
    expect(nutrients.kcal).toBe(102); // 155 * 0.66 = 102.3 → 102
    expect(nutrients.proteinG).toBe(8.3); // 12.6 * 0.66 = 8.316 → 8.3
  });
});

describe('sumNutrients', () => {
  it('always sums core macros and only sums micros that exist', () => {
    const total = sumNutrients([
      { kcal: 100, proteinG: 10, carbsG: 5, fatG: 2, fiberG: 3 },
      { kcal: 50, proteinG: 5, carbsG: 2, fatG: 1 },
    ]);
    expect(total.kcal).toBe(150);
    expect(total.proteinG).toBe(15);
    expect(total.fiberG).toBe(3);
  });

  it('returns zeroed macros for an empty day', () => {
    expect(sumNutrients([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});

describe('recipePerServing', () => {
  it('divides ingredient totals by servings (meal-prep vector)', () => {
    // 600g chicken (165kcal/100g) + 720g rice (121) + 27g oil (884) + 110g onion (40)
    const per = recipePerServing(
      [
        { grams: 600, per100: { kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 } },
        { grams: 720, per100: { kcal: 121, proteinG: 3.5, carbsG: 25.2, fatG: 0.4 } },
        { grams: 27, per100: { kcal: 884, proteinG: 0, carbsG: 0, fatG: 100 } },
        { grams: 110, per100: { kcal: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1 } },
      ],
      4,
    );
    expect(per.kcal).toBe(536); // matches the value rendered in the UI
    expect(per.proteinG).toBe(53.1); // 53.095 → 1-decimal rounding
  });

  it('rejects zero or negative servings', () => {
    expect(() => recipePerServing([], 0)).toThrow(RangeError);
    expect(() => recipePerServing([], -2)).toThrow(RangeError);
  });
});

describe('remainingKcal', () => {
  it('credits exercise when enabled', () => {
    expect(remainingKcal({ calorieTarget: 2200, consumedKcal: 1800, exerciseBurnedKcal: 300, creditExercise: true })).toBe(700);
  });
  it('ignores exercise when disabled', () => {
    expect(remainingKcal({ calorieTarget: 2200, consumedKcal: 1800, exerciseBurnedKcal: 300, creditExercise: false })).toBe(400);
  });
  it('goes negative when over budget (never clamped silently)', () => {
    expect(remainingKcal({ calorieTarget: 2000, consumedKcal: 2500, exerciseBurnedKcal: 0, creditExercise: true })).toBe(-500);
  });
});

describe('progressPct', () => {
  it('clamps to [0,1] and never returns NaN', () => {
    expect(progressPct(50, 100)).toBe(0.5);
    expect(progressPct(150, 100)).toBe(1);
    expect(progressPct(-5, 100)).toBe(0);
    expect(progressPct(10, 0)).toBe(0);
    expect(progressPct(10, Number.NaN)).toBe(0);
  });
});
