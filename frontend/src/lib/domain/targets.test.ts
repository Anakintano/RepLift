import { describe, expect, it } from 'vitest';
import { ageFromBirthDate, deriveTargets, mifflinStJeor } from './targets';

describe('mifflinStJeor', () => {
  it('matches published reference values', () => {
    // 30y male, 180cm, 80kg: 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(mifflinStJeor({ sex: 'male', ageYears: 30, heightCm: 180, weightKg: 80 })).toBe(1780);
    // 25y female, 165cm, 60kg: 600 + 1031.25 - 125 - 161 = 1345.25
    expect(mifflinStJeor({ sex: 'female', ageYears: 25, heightCm: 165, weightKg: 60 })).toBeCloseTo(1345.25);
  });
});

describe('deriveTargets', () => {
  const base = { sex: 'male' as const, ageYears: 24, heightCm: 177, weightKg: 82 };

  it('produces a coherent plan for weight loss', () => {
    const t = deriveTargets({ ...base, activityLevel: 'moderate', goalType: 'lose', weeklyRateKg: 0.5 });
    // TDEE = (820+1106.25-120+5)*1.55 = 2807; deficit 550 → 2257 → rounded to 2260
    expect(t.calorieTarget).toBe(2260);
    expect(t.proteinTargetG).toBe(148); // 1.8 g/kg
    expect(t.clampedToFloor).toBe(false);
    // macro energy roughly reconstructs the calorie target
    const macroKcal = t.proteinTargetG * 4 + t.carbsTargetG * 4 + t.fatTargetG * 9;
    expect(Math.abs(macroKcal - t.calorieTarget)).toBeLessThan(20);
  });

  it('maintain goal equals TDEE (rounded to 10)', () => {
    const t = deriveTargets({ ...base, activityLevel: 'sedentary', goalType: 'maintain', weeklyRateKg: 0 });
    expect(t.calorieTarget).toBe(Math.round(t.tdee / 10) * 10);
  });

  it('never recommends below the safety floor', () => {
    const t = deriveTargets({
      sex: 'female',
      ageYears: 40,
      heightCm: 150,
      weightKg: 45,
      activityLevel: 'sedentary',
      goalType: 'lose',
      weeklyRateKg: 1,
    });
    expect(t.calorieTarget).toBeGreaterThanOrEqual(1200);
    expect(t.clampedToFloor).toBe(true);
  });

  it('surplus for gain goals', () => {
    const lose = deriveTargets({ ...base, activityLevel: 'moderate', goalType: 'lose', weeklyRateKg: 0.5 });
    const gain = deriveTargets({ ...base, activityLevel: 'moderate', goalType: 'gain', weeklyRateKg: 0.5 });
    expect(gain.calorieTarget - lose.calorieTarget).toBeCloseTo(1100, -1); // 2 × 550
  });
});

describe('ageFromBirthDate', () => {
  it('handles pre- and post-birthday correctly', () => {
    expect(ageFromBirthDate('2000-07-20', '2026-07-16')).toBe(25); // birthday in 4 days
    expect(ageFromBirthDate('2000-07-16', '2026-07-16')).toBe(26); // birthday today
    expect(ageFromBirthDate('2000-07-10', '2026-07-16')).toBe(26);
  });
});
