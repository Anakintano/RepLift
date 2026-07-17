/**
 * Export the TS seed data (foods, demo history, recipes, saved meals) to JSON
 * for the FastAPI seeder — one source of truth for both mock and backend.
 * Run: npx tsx scripts/export-seed.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { SEED_FOODS, SEARCH_SYNONYMS } from '../src/lib/api/mock/seed/foods';
import {
  demoProfile,
  demoUser,
  demoGoals,
  generateDemoHistory,
  demoRecipes,
  demoSavedMeals,
  DEMO_PASSWORD,
  DEMO_TIMEZONE,
} from '../src/lib/api/mock/seed/demo';
import { todayIn } from '../src/lib/domain/dates';
import { recipePerServing } from '../src/lib/domain/nutrition';

const today = todayIn(DEMO_TIMEZONE);
const foodsById = new Map(SEED_FOODS.map((f) => [f.id, f]));

const recipes = demoRecipes().map((r) => ({
  ...r,
  perServing: recipePerServing(
    r.ingredients.map((i) => ({ grams: i.grams, per100: foodsById.get(i.foodId)!.nutrients })),
    r.servings,
  ),
}));

const out = {
  generatedAt: new Date().toISOString(),
  today,
  foods: SEED_FOODS,
  synonyms: SEARCH_SYNONYMS,
  demo: {
    user: demoUser,
    password: DEMO_PASSWORD,
    profile: demoProfile,
    goals: demoGoals(today),
    history: generateDemoHistory(today),
    recipes,
    savedMeals: demoSavedMeals(),
  },
};

mkdirSync('../backend/app/data', { recursive: true });
writeFileSync('../backend/app/data/seed.json', JSON.stringify(out, null, 1));
console.log(`Exported ${out.foods.length} foods, ${out.demo.history.length} history entries → backend/app/data/seed.json`);
