/**
 * Day/week aggregation rules — shared by the UI (computing from local
 * entries while offline) and the mock server (computing "server-side"),
 * and mirrored by the Phase-2 backend. One implementation, one answer.
 */

import type { DaySummary, DiaryEntry, Goal, LocalDate, WeeklyReport } from '../api/types';
import { remainingKcal, roundHalfUp, sumNutrients } from './nutrition';
import { addDays, dateRange } from './dates';

export function computeDaySummary(date: LocalDate, entries: DiaryEntry[], goal: Goal): DaySummary {
  const live = entries.filter((e) => e.date === date && !e.deleted);
  const foods = live.filter((e) => e.kind === 'food');
  const consumed = sumNutrients(foods.map((f) => f.nutrients));
  const burnedExercise = live.filter((e) => e.kind === 'exercise').reduce((s, e) => s + e.caloriesBurned, 0);
  const waterMl = live.filter((e) => e.kind === 'water').reduce((s, e) => s + e.amountMl, 0);

  return {
    date,
    consumed,
    burnedExercise,
    waterMl,
    goal: {
      calorieTarget: goal.calorieTarget,
      proteinTargetG: goal.proteinTargetG,
      carbsTargetG: goal.carbsTargetG,
      fatTargetG: goal.fatTargetG,
      waterTargetMl: goal.waterTargetMl,
    },
    remainingKcal: remainingKcal({
      calorieTarget: goal.calorieTarget,
      consumedKcal: consumed.kcal,
      exerciseBurnedKcal: burnedExercise,
      creditExercise: true,
    }),
    entryCount: live.length,
  };
}

export function computeWeeklyReport(weekStart: LocalDate, entries: DiaryEntry[], goal: Goal): WeeklyReport {
  const weekEnd = addDays(weekStart, 6);
  const days = dateRange(weekStart, weekEnd);
  const live = entries.filter((e) => !e.deleted && e.date >= weekStart && e.date <= weekEnd);

  const foodsOn = (date: LocalDate) =>
    live.filter((e): e is Extract<DiaryEntry, { kind: 'food' }> => e.kind === 'food' && e.date === date);

  const perDay = days.map((date) => {
    const kcal = roundHalfUp(foodsOn(date).reduce((s, f) => s + f.nutrients.kcal, 0));
    return { date, kcal, target: goal.calorieTarget };
  });

  const loggedDays = perDay.filter((d) => live.some((e) => e.date === d.date));
  const daysLogged = loggedDays.length;
  const avg = (fn: (d: LocalDate) => number) =>
    daysLogged === 0 ? 0 : roundHalfUp(loggedDays.reduce((s, d) => s + fn(d.date), 0) / daysLogged, 1);

  const weights = live
    .filter((e): e is Extract<DiaryEntry, { kind: 'weight' }> => e.kind === 'weight')
    .sort((a, b) => a.date.localeCompare(b.date));
  const weightChangeKg =
    weights.length >= 2 ? roundHalfUp(weights[weights.length - 1].weightKg - weights[0].weightKg, 1) : null;

  const exercises = live.filter((e) => e.kind === 'exercise');

  const withinTarget = loggedDays.filter((d) => {
    const foodDay = perDay.find((p) => p.date === d.date)!;
    return foodDay.kcal > 0 && Math.abs(foodDay.kcal - goal.calorieTarget) / goal.calorieTarget <= 0.1;
  });

  const bestDay =
    withinTarget.length > 0
      ? withinTarget.reduce((best, d) => {
          const cur = perDay.find((p) => p.date === d.date)!;
          const bst = perDay.find((p) => p.date === best.date)!;
          return Math.abs(cur.kcal - goal.calorieTarget) < Math.abs(bst.kcal - goal.calorieTarget) ? d : best;
        }).date
      : null;

  return {
    weekStart,
    weekEnd,
    avgKcal: avg((d) => foodsOn(d).reduce((s, f) => s + f.nutrients.kcal, 0)),
    avgProteinG: avg((d) => foodsOn(d).reduce((s, f) => s + f.nutrients.proteinG, 0)),
    avgCarbsG: avg((d) => foodsOn(d).reduce((s, f) => s + f.nutrients.carbsG, 0)),
    avgFatG: avg((d) => foodsOn(d).reduce((s, f) => s + f.nutrients.fatG, 0)),
    avgWaterMl: avg((d) =>
      live
        .filter((e): e is Extract<DiaryEntry, { kind: 'water' }> => e.kind === 'water' && e.date === d)
        .reduce((s, e) => s + e.amountMl, 0),
    ),
    daysLogged,
    weightChangeKg,
    exerciseSessions: exercises.length,
    exerciseMinutes: exercises.reduce((s, e) => s + e.durationMin, 0),
    caloriesBurned: roundHalfUp(exercises.reduce((s, e) => s + e.caloriesBurned, 0)),
    adherencePct: daysLogged === 0 ? 0 : roundHalfUp((withinTarget.length / daysLogged) * 100),
    bestDay,
    perDay,
  };
}
