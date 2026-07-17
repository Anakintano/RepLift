import { describe, expect, it } from 'vitest';
import { editDistance, normalize, searchFoods, scoreFood } from './search';
import { SEED_FOODS } from './seed/foods';

const noHistory = { counts: new Map<string, number>() };

describe('editDistance', () => {
  it('computes small distances and early-exits beyond max', () => {
    expect(editDistance('chiken', 'chicken')).toBe(1);
    expect(editDistance('brest', 'breast')).toBe(1);
    expect(editDistance('xyz', 'chicken', 2)).toBeGreaterThan(2);
  });
});

describe('normalize', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalize("  Lay's  Chips! ")).toBe('lay s chips');
  });
});

describe('searchFoods ranking', () => {
  it('ranks chicken breast first for the double-typo query "chiken brest"', () => {
    const results = searchFoods(SEED_FOODS, 'chiken brest', noHistory);
    expect(results[0].food.id).toBe('food-chicken-breast');
    expect(results[0].explain.fuzzy).toBe(true);
  });

  it('exact prefix beats fuzzy', () => {
    const results = searchFoods(SEED_FOODS, 'banana', noHistory);
    expect(results[0].food.id).toBe('food-banana');
    expect(results[0].explain.fuzzy).toBe(false);
  });

  it('expands synonyms (chapati → roti)', () => {
    const results = searchFoods(SEED_FOODS, 'chapati', noHistory);
    expect(results.some((r) => r.food.id === 'food-roti')).toBe(true);
  });

  it('personal history boosts a food the user logs often', () => {
    const query = 'milk';
    const without = searchFoods(SEED_FOODS, query, noHistory);
    const withHistory = searchFoods(SEED_FOODS, query, { counts: new Map([['food-milk-almond', 10]]) });
    const posWithout = without.findIndex((r) => r.food.id === 'food-milk-almond');
    const posWith = withHistory.findIndex((r) => r.food.id === 'food-milk-almond');
    expect(posWith).toBeLessThan(posWithout);
    expect(withHistory[posWith].explain.personalBoost).toBeGreaterThan(0);
  });

  it('score breakdown is explainable: parts sum to the total', () => {
    const r = scoreFood(SEED_FOODS.find((f) => f.id === 'food-banana')!, 'banana', { counts: new Map([['food-banana', 3]]) })!;
    const sum = r.explain.textScore + r.explain.popularityBoost + r.explain.personalBoost;
    expect(r.score).toBeCloseTo(sum, 1);
  });

  it('returns nothing for garbage queries instead of noise', () => {
    expect(searchFoods(SEED_FOODS, 'qqqqzzzz', noHistory)).toHaveLength(0);
  });
});
