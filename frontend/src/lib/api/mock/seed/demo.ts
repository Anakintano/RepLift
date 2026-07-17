/**
 * Demo account seed: profile, goals, and ~5 weeks of realistic diary history
 * generated with a deterministic RNG so every reset produces identical data.
 * Login: demo@replift.app / demo1234 (also used by Playwright).
 */

import type {
  DiaryEntry,
  ExerciseEntry,
  FoodEntry,
  Goal,
  MealSlot,
  Profile,
  Recipe,
  SavedMeal,
  User,
  WaterEntry,
  WeightEntry,
  MeasurementEntry,
} from '../../types';
import { nutrientsForServing } from '../../../domain/nutrition';
import { addDays, todayIn } from '../../../domain/dates';
import { mulberry32, pick, randInt } from '../rng';
import { SEED_FOODS, type SeedFood } from './foods';

export const DEMO_USER_ID = 'user-demo';
export const DEMO_EMAIL = 'demo@replift.app';
export const DEMO_PASSWORD = 'demo1234';
export const DEMO_TIMEZONE = 'Asia/Kolkata';

export const demoUser: User = {
  id: DEMO_USER_ID,
  email: DEMO_EMAIL,
  displayName: 'Aditya',
  createdAt: '2026-05-28T08:12:00Z',
  emailVerified: true,
};

export const demoProfile: Profile = {
  userId: DEMO_USER_ID,
  sex: 'male',
  birthDate: '2002-03-14',
  heightCm: 177,
  activityLevel: 'moderate',
  unitSystem: 'metric',
  timezone: DEMO_TIMEZONE,
  onboardingCompleted: true,
};

export function demoGoals(today: string): Goal[] {
  return [
    {
      id: 'goal-demo-1',
      userId: DEMO_USER_ID,
      goalType: 'lose',
      weeklyRateKg: -0.5,
      targetWeightKg: 76,
      calorieTarget: 2200,
      proteinTargetG: 150,
      carbsTargetG: 220,
      fatTargetG: 61,
      waterTargetMl: 3000,
      effectiveDate: addDays(today, -36),
      createdAt: '2026-05-28T08:20:00Z',
    },
  ];
}

function bySlug(slug: string): SeedFood {
  const f = SEED_FOODS.find((x) => x.id === `food-${slug}`);
  if (!f) throw new Error(`seed food missing: ${slug}`);
  return f;
}

const MEAL_POOLS: Record<MealSlot, string[][]> = {
  breakfast: [
    ['oats', 'milk-2', 'banana'],
    ['egg-whole', 'bread-whole-wheat', 'coffee-latte'],
    ['greek-yogurt', 'blueberries', 'granola'],
    ['poha', 'chai'],
    ['idli', 'chai'],
    ['pancakes', 'strawberries', 'coffee-black'],
  ],
  lunch: [
    ['chicken-breast', 'white-rice', 'broccoli'],
    ['dal-cooked', 'roti', 'mixed-salad'],
    ['chicken-biryani', 'cucumber'],
    ['burrito-bowl', 'coca-cola'],
    ['pasta-cooked', 'caesar-salad'],
    ['rajma', 'basmati-rice'],
  ],
  dinner: [
    ['salmon', 'quinoa-cooked', 'green-beans'],
    ['palak-paneer', 'roti'],
    ['butter-chicken', 'naan'],
    ['ground-beef-90', 'potato-baked', 'mixed-salad'],
    ['tofu-firm', 'brown-rice', 'bell-pepper'],
    ['chole', 'basmati-rice', 'onion'],
  ],
  snacks: [
    ['whey-protein', 'banana'],
    ['almonds', 'apple'],
    ['protein-bar'],
    ['peanut-butter', 'bread-white'],
    ['dark-chocolate', 'coffee-black'],
    ['samosa', 'chai'],
  ],
};

const EXERCISES: Array<Pick<ExerciseEntry, 'name' | 'category' | 'durationMin' | 'caloriesBurned'> & { distanceKm?: number }> = [
  { name: 'Push day (chest/shoulders/triceps)', category: 'strength', durationMin: 65, caloriesBurned: 310 },
  { name: 'Pull day (back/biceps)', category: 'strength', durationMin: 60, caloriesBurned: 290 },
  { name: 'Leg day (squat focus)', category: 'strength', durationMin: 70, caloriesBurned: 350 },
  { name: 'Outdoor run', category: 'cardio', durationMin: 32, caloriesBurned: 340, distanceKm: 5.2 },
  { name: 'Cycling', category: 'cardio', durationMin: 45, caloriesBurned: 380, distanceKm: 14 },
  { name: 'Yoga flow', category: 'flexibility', durationMin: 40, caloriesBurned: 140 },
  { name: 'Badminton', category: 'sports', durationMin: 50, caloriesBurned: 330 },
];

/** Generate the full diary history, ending at `today` (user-tz). */
export function generateDemoHistory(today?: string): DiaryEntry[] {
  const endDay = today ?? todayIn(DEMO_TIMEZONE);
  const rand = mulberry32(0x5eed);
  const entries: DiaryEntry[] = [];
  const DAYS = 36;
  let seq = 0;
  const id = () => `demo-e-${(seq += 1).toString().padStart(4, '0')}`;

  let weight = 84.2;

  for (let back = DAYS; back >= 0; back--) {
    const date = addDays(endDay, -back);
    const dayIdx = DAYS - back;
    // ~8% of past days are unlogged (realistic gaps); today always starts logged
    if (back !== 0 && rand() < 0.08) continue;

    const stamp = (h: number, m: number) => {
      const iso = `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`;
      return new Date(iso).toISOString();
    };

    const base = { userId: DEMO_USER_ID, revision: 1, date, deleted: false as const, syncState: 'synced' as const };

    // Meals — today gets breakfast+lunch only, so the demo dashboard has room to log more
    const slots: Array<{ slot: MealSlot; hour: number }> = [
      { slot: 'breakfast', hour: 8 },
      { slot: 'lunch', hour: 13 },
      ...(back === 0 ? [] : [{ slot: 'dinner' as MealSlot, hour: 20 }, { slot: 'snacks' as MealSlot, hour: 17 }]),
    ];
    for (const { slot, hour } of slots) {
      if (slot === 'snacks' && rand() < 0.35) continue; // snacks skipped some days
      const combo = pick(rand, MEAL_POOLS[slot]);
      for (const slug of combo) {
        const food = bySlug(slug);
        const unit = food.servingUnits[0];
        const quantity = food.isLiquid || !unit ? 1 : pick(rand, [0.5, 1, 1, 1, 1.5, 2]);
        const unitId = unit ? unit.id : 'g';
        const resolvedQty = unit ? quantity : 100 * quantity;
        const { grams, nutrients } = nutrientsForServing(food, resolvedQty, unitId);
        const t = stamp(hour, randInt(rand, 0, 50));
        const entry: FoodEntry = {
          ...base,
          id: id(),
          kind: 'food',
          meal: slot,
          foodId: food.id,
          foodVersion: food.version,
          foodName: food.name,
          brand: food.brand,
          quantity: resolvedQty,
          unitId,
          unitLabel: unit ? unit.label : 'g',
          grams,
          nutrients,
          loggedAt: t,
          updatedAt: t,
        };
        entries.push(entry);
      }
    }

    // Water: 5–11 logs of 250–500 ml
    const waterLogs = back === 0 ? 4 : randInt(rand, 5, 11);
    for (let w = 0; w < waterLogs; w++) {
      const t = stamp(randInt(rand, 7, 22), randInt(rand, 0, 59));
      const entry: WaterEntry = { ...base, id: id(), kind: 'water', amountMl: pick(rand, [250, 250, 300, 500]), loggedAt: t, updatedAt: t };
      entries.push(entry);
    }

    // Exercise ~4x/week (never on "today" so the user can log one)
    if (back !== 0 && rand() < 0.57) {
      const ex = pick(rand, EXERCISES);
      const t = stamp(randInt(rand, 6, 19), randInt(rand, 0, 59));
      const entry: ExerciseEntry = {
        ...base,
        id: id(),
        kind: 'exercise',
        name: ex.name,
        category: ex.category,
        durationMin: ex.durationMin + randInt(rand, -8, 8),
        caloriesBurned: ex.caloriesBurned + randInt(rand, -40, 40),
        distanceKm: ex.distanceKm,
        loggedAt: t,
        updatedAt: t,
      };
      entries.push(entry);
    }

    // Weight: most mornings, trending down ~0.45 kg/week with noise
    weight -= 0.065 + (rand() - 0.5) * 0.22;
    if (rand() < 0.8) {
      const t = stamp(7, randInt(rand, 0, 30));
      const entry: WeightEntry = { ...base, id: id(), kind: 'weight', weightKg: Math.round(weight * 10) / 10, loggedAt: t, updatedAt: t };
      entries.push(entry);
    }

    // Measurements: weekly on Sundays
    if (dayIdx % 7 === 3) {
      const t = stamp(7, 45);
      const waist = 88 - dayIdx * 0.06 + (rand() - 0.5);
      const m1: MeasurementEntry = { ...base, id: id(), kind: 'measurement', site: 'waist', value: Math.round(waist * 10) / 10, loggedAt: t, updatedAt: t };
      const m2: MeasurementEntry = { ...base, id: id(), kind: 'measurement', site: 'chest', value: Math.round((101 + dayIdx * 0.01) * 10) / 10, loggedAt: t, updatedAt: t };
      entries.push(m1, m2);
    }
  }

  return entries;
}

export function demoRecipes(): Recipe[] {
  const chicken = bySlug('chicken-breast');
  const rice = bySlug('basmati-rice');
  const oil = bySlug('olive-oil');
  const onion = bySlug('onion');
  const whey = bySlug('whey-protein');
  const pb = bySlug('peanut-butter');
  const banana = bySlug('banana');
  const milk = bySlug('milk-2');

  const ing = (food: SeedFood, grams: number, seq: number) => ({
    id: `demo-ri-${seq}`,
    foodId: food.id,
    foodVersion: food.version,
    foodName: food.name,
    quantity: grams,
    unitId: 'g' as const,
    grams,
  });

  return [
    {
      id: 'recipe-demo-1',
      userId: DEMO_USER_ID,
      revision: 1,
      name: 'Meal-prep chicken & rice',
      description: 'Sunday batch cook — 4 lunch portions.',
      servings: 4,
      ingredients: [ing(chicken, 600, 1), ing(rice, 720, 2), ing(oil, 27, 3), ing(onion, 110, 4)],
      perServing: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }, // recomputed at seed time
      createdAt: '2026-06-02T10:00:00Z',
      updatedAt: '2026-06-02T10:00:00Z',
    },
    {
      id: 'recipe-demo-2',
      userId: DEMO_USER_ID,
      revision: 1,
      name: 'PB banana protein shake',
      servings: 1,
      ingredients: [ing(whey, 32, 5), ing(pb, 32, 6), ing(banana, 118, 7), ing(milk, 300, 8)],
      perServing: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      createdAt: '2026-06-10T07:30:00Z',
      updatedAt: '2026-06-10T07:30:00Z',
    },
  ];
}

export function demoSavedMeals(): SavedMeal[] {
  const oats = bySlug('oats');
  const milk = bySlug('milk-2');
  const banana = bySlug('banana');
  const item = (food: SeedFood, quantity: number, unitIdx: number) => {
    const unit = food.servingUnits[unitIdx];
    const { grams, nutrients } = nutrientsForServing(food, quantity, unit.id);
    return { foodId: food.id, foodVersion: food.version, foodName: food.name, quantity, unitId: unit.id, grams, nutrients };
  };
  return [
    {
      id: 'saved-demo-1',
      userId: DEMO_USER_ID,
      revision: 1,
      name: 'My usual breakfast',
      items: [item(oats, 1, 0), item(milk, 1, 0), item(banana, 1, 0)],
      createdAt: '2026-06-05T08:00:00Z',
    },
  ];
}
