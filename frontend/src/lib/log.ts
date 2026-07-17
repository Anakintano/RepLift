/** Builders that turn UI intents into diary entries and hand them to the outbox. */

import type { ExerciseEntry, Food, FoodEntry, LocalDate, MealSlot, MeasurementEntry, WaterEntry, WeightEntry } from './api/types';
import { nutrientsForServing } from './domain/nutrition';
import { createEntry } from './sync/outbox';

function base(date: LocalDate) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    userId: 'me', // server derives the real owner from the session
    revision: 0,
    date,
    loggedAt: now,
    updatedAt: now,
    deleted: false as const,
  };
}

export async function logFood(params: {
  date: LocalDate;
  meal: MealSlot;
  food: Food;
  quantity: number;
  unitId: string;
}): Promise<FoodEntry> {
  const { date, meal, food, quantity, unitId } = params;
  const { grams, nutrients } = nutrientsForServing(food, quantity, unitId);
  const unit = unitId === 'g' ? null : food.servingUnits.find((u) => u.id === unitId);
  const entry: FoodEntry = {
    ...base(date),
    kind: 'food',
    meal,
    foodId: food.id,
    foodVersion: food.version,
    foodName: food.name,
    brand: food.brand,
    quantity,
    unitId,
    unitLabel: unit ? unit.label : food.isLiquid ? 'ml' : 'g',
    grams,
    nutrients,
  };
  await createEntry(entry);
  return entry;
}

export async function logWater(date: LocalDate, amountMl: number): Promise<WaterEntry> {
  const entry: WaterEntry = { ...base(date), kind: 'water', amountMl };
  await createEntry(entry);
  return entry;
}

export async function logExercise(
  date: LocalDate,
  data: Omit<ExerciseEntry, keyof ReturnType<typeof base> | 'kind'>,
): Promise<ExerciseEntry> {
  const entry: ExerciseEntry = { ...base(date), kind: 'exercise', ...data };
  await createEntry(entry);
  return entry;
}

export async function logWeight(date: LocalDate, weightKg: number): Promise<WeightEntry> {
  const entry: WeightEntry = { ...base(date), kind: 'weight', weightKg };
  await createEntry(entry);
  return entry;
}

export async function logMeasurement(
  date: LocalDate,
  site: MeasurementEntry['site'],
  value: number,
): Promise<MeasurementEntry> {
  const entry: MeasurementEntry = { ...base(date), kind: 'measurement', site, value };
  await createEntry(entry);
  return entry;
}
