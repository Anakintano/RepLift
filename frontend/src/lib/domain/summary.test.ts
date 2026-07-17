import { describe, expect, it } from 'vitest';
import { computeDaySummary, computeWeeklyReport } from './summary';
import type { DiaryEntry, Goal } from '../api/types';

const goal: Goal = {
  id: 'g1',
  userId: 'u1',
  goalType: 'lose',
  weeklyRateKg: -0.5,
  calorieTarget: 2000,
  proteinTargetG: 140,
  carbsTargetG: 200,
  fatTargetG: 60,
  waterTargetMl: 3000,
  effectiveDate: '2026-07-01',
  createdAt: '2026-07-01T00:00:00Z',
};

let seq = 0;
function entry(partial: Partial<DiaryEntry> & { kind: DiaryEntry['kind']; date: string }): DiaryEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    userId: 'u1',
    revision: 1,
    loggedAt: `${partial.date}T10:00:00Z`,
    updatedAt: `${partial.date}T10:00:00Z`,
    deleted: false,
    ...partial,
  } as DiaryEntry;
}

const food = (date: string, kcal: number, extra: object = {}) =>
  entry({
    kind: 'food',
    date,
    meal: 'lunch',
    foodId: 'f1',
    foodVersion: 1,
    foodName: 'Test food',
    quantity: 1,
    unitId: 'g',
    unitLabel: 'g',
    grams: 100,
    nutrients: { kcal, proteinG: 10, carbsG: 20, fatG: 5 },
    ...extra,
  } as never);

describe('computeDaySummary', () => {
  it('aggregates food, water, exercise for the day only', () => {
    const entries: DiaryEntry[] = [
      food('2026-07-16', 500),
      food('2026-07-16', 300),
      food('2026-07-15', 900), // different day — excluded
      entry({ kind: 'water', date: '2026-07-16', amountMl: 500 } as never),
      entry({ kind: 'exercise', date: '2026-07-16', name: 'Run', category: 'cardio', durationMin: 30, caloriesBurned: 250 } as never),
    ];
    const s = computeDaySummary('2026-07-16', entries, goal);
    expect(s.consumed.kcal).toBe(800);
    expect(s.waterMl).toBe(500);
    expect(s.burnedExercise).toBe(250);
    expect(s.remainingKcal).toBe(2000 - 800 + 250);
    expect(s.entryCount).toBe(4);
  });

  it('excludes tombstoned (deleted) entries — deletes must not count', () => {
    const dead = { ...food('2026-07-16', 999), deleted: true } as DiaryEntry;
    const s = computeDaySummary('2026-07-16', [dead, food('2026-07-16', 100)], goal);
    expect(s.consumed.kcal).toBe(100);
  });
});

describe('computeWeeklyReport', () => {
  const week = '2026-07-13'; // Monday
  it('computes averages over logged days only and adherence within ±10%', () => {
    const entries: DiaryEntry[] = [
      food('2026-07-13', 2000), // on target
      food('2026-07-14', 1000), // off target
      // 5 unlogged days
    ];
    const r = computeWeeklyReport(week, entries, goal);
    expect(r.daysLogged).toBe(2);
    expect(r.avgKcal).toBe(1500);
    expect(r.adherencePct).toBe(50);
    expect(r.bestDay).toBe('2026-07-13');
    expect(r.perDay).toHaveLength(7);
    expect(r.perDay[6].kcal).toBe(0);
  });

  it('weight change uses first and last weigh-in of the week', () => {
    const entries: DiaryEntry[] = [
      entry({ kind: 'weight', date: '2026-07-13', weightKg: 82.0 } as never),
      entry({ kind: 'weight', date: '2026-07-16', weightKg: 81.4 } as never),
    ];
    const r = computeWeeklyReport(week, entries, goal);
    expect(r.weightChangeKg).toBe(-0.6);
  });

  it('handles an empty week without NaN', () => {
    const r = computeWeeklyReport(week, [], goal);
    expect(r.avgKcal).toBe(0);
    expect(r.adherencePct).toBe(0);
    expect(r.weightChangeKg).toBeNull();
    expect(r.bestDay).toBeNull();
  });
});
