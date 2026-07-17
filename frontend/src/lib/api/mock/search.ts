/**
 * Mock food search — same ranking model the Phase-2 backend implements in
 * Postgres (FTS + pg_trgm), so search behavior doesn't change when the real
 * backend lands:
 *
 *   score = textScore × (1 + 0.3·log10(1 + popularity)) + personalBoost
 *
 * textScore: exact 100 / prefix 80 / all-tokens 60 / some-tokens 30·frac,
 * with fuzzy token matches (edit distance ≤ 2 for len ≥ 5, ≤ 1 for len ≥ 3)
 * counting at 70% weight. Synonyms expand the query before matching.
 * The breakdown is returned on every result — ranking must stay explainable.
 */

import type { FoodSearchResult } from '../types';
import { SEARCH_SYNONYMS, type SeedFood } from './seed/foods';

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9%\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Damerau-ish Levenshtein with early exit; small strings only. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      rowMin = Math.min(rowMin, dp[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return dp[a.length][b.length];
}

function fuzzyTokenMatch(queryToken: string, nameTokens: string[]): 'exact' | 'fuzzy' | 'none' {
  for (const t of nameTokens) {
    if (t === queryToken || t.startsWith(queryToken)) return 'exact';
  }
  if (queryToken.length >= 3) {
    const budget = queryToken.length >= 5 ? 2 : 1;
    for (const t of nameTokens) {
      if (editDistance(queryToken, t, budget) <= budget) return 'fuzzy';
    }
  }
  return 'none';
}

function expandQuery(query: string): string[] {
  const base = normalize(query);
  const expanded = [base];
  for (const [syn, targets] of Object.entries(SEARCH_SYNONYMS)) {
    if (base.includes(syn)) {
      for (const t of targets) expanded.push(base.replace(syn, t));
    }
  }
  return expanded;
}

export interface PersonalStats {
  /** foodId -> log count for the current user */
  counts: Map<string, number>;
}

export function scoreFood(food: SeedFood, rawQuery: string, personal: PersonalStats): FoodSearchResult | null {
  const name = normalize(`${food.name} ${food.brand ?? ''}`);
  const nameTokens = name.split(' ');
  let best = { textScore: 0, fuzzy: false };

  for (const q of expandQuery(rawQuery)) {
    if (!q) continue;
    let textScore = 0;
    let fuzzy = false;
    if (name === q) {
      textScore = 100;
    } else if (name.startsWith(q)) {
      textScore = 80;
    } else {
      const qTokens = q.split(' ');
      let matched = 0;
      let fuzzyMatched = 0;
      for (const qt of qTokens) {
        const m = fuzzyTokenMatch(qt, nameTokens);
        if (m === 'exact') matched += 1;
        else if (m === 'fuzzy') fuzzyMatched += 1;
      }
      const effective = matched + fuzzyMatched * 0.7;
      if (matched + fuzzyMatched === qTokens.length) {
        textScore = 60 * (effective / qTokens.length);
      } else if (effective > 0) {
        textScore = 30 * (effective / qTokens.length);
      }
      fuzzy = fuzzyMatched > 0;
    }
    if (textScore > best.textScore) best = { textScore, fuzzy };
  }

  if (best.textScore <= 0) return null;

  const popularityBoost = best.textScore * 0.3 * Math.log10(1 + food.popularity);
  const logCount = personal.counts.get(food.id) ?? 0;
  const personalBoost = Math.min(25, logCount * 5);

  const { popularity: _pop, ...contract } = food;
  return {
    food: contract,
    score: Math.round((best.textScore + popularityBoost + personalBoost) * 10) / 10,
    explain: {
      textScore: Math.round(best.textScore * 10) / 10,
      popularityBoost: Math.round(popularityBoost * 10) / 10,
      personalBoost,
      fuzzy: best.fuzzy,
    },
  };
}

export function searchFoods(catalog: SeedFood[], query: string, personal: PersonalStats): FoodSearchResult[] {
  const results: FoodSearchResult[] = [];
  for (const f of catalog) {
    const r = scoreFood(f, query, personal);
    if (r) results.push(r);
  }
  results.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name));
  return results;
}
