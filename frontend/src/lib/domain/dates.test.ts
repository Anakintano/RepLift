import { describe, expect, it } from 'vitest';
import { addDays, compareDates, dateRange, diaryDayOf, friendlyDay, todayIn, weekBoundsOf } from './dates';

describe('diaryDayOf — timezone-correct diary days', () => {
  it('assigns a late-night Kolkata log to the local date, not UTC', () => {
    // 2026-07-16 23:30 IST = 2026-07-16 18:00 UTC → same date... use a case that differs:
    // 2026-07-16 01:30 IST = 2026-07-15 20:00 UTC → local date must win
    const instant = new Date('2026-07-15T20:00:00Z');
    expect(diaryDayOf(instant, 'Asia/Kolkata')).toBe('2026-07-16');
    expect(diaryDayOf(instant, 'UTC')).toBe('2026-07-15');
  });

  it('handles western timezones on the other side of midnight', () => {
    // 2026-07-16 02:00 UTC = 2026-07-15 19:00 in Los Angeles
    const instant = new Date('2026-07-16T02:00:00Z');
    expect(diaryDayOf(instant, 'America/Los_Angeles')).toBe('2026-07-15');
  });

  it('todayIn is injectable for testing', () => {
    expect(todayIn('UTC', () => new Date('2026-02-28T12:00:00Z'))).toBe('2026-02-28');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('weekBoundsOf', () => {
  it('returns the Monday-start week', () => {
    expect(weekBoundsOf('2026-07-16')).toEqual({ start: '2026-07-13', end: '2026-07-19' }); // Thursday
    expect(weekBoundsOf('2026-07-13')).toEqual({ start: '2026-07-13', end: '2026-07-19' }); // Monday itself
    expect(weekBoundsOf('2026-07-19')).toEqual({ start: '2026-07-13', end: '2026-07-19' }); // Sunday
  });
});

describe('dateRange / compareDates', () => {
  it('produces an inclusive ascending range', () => {
    expect(dateRange('2026-07-14', '2026-07-16')).toEqual(['2026-07-14', '2026-07-15', '2026-07-16']);
  });
  it('compares lexicographically', () => {
    expect(compareDates('2026-07-14', '2026-07-16')).toBe(-1);
    expect(compareDates('2026-07-16', '2026-07-16')).toBe(0);
  });
});

describe('friendlyDay', () => {
  const now = () => new Date('2026-07-16T10:00:00Z');
  it('labels today/yesterday/tomorrow relative to the user timezone', () => {
    expect(friendlyDay('2026-07-16', 'UTC', now)).toBe('Today');
    expect(friendlyDay('2026-07-15', 'UTC', now)).toBe('Yesterday');
    expect(friendlyDay('2026-07-17', 'UTC', now)).toBe('Tomorrow');
    expect(friendlyDay('2026-07-10', 'UTC', now)).toMatch(/Jul 10/);
  });
});
