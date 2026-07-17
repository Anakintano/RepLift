/**
 * Diary-day boundary rules. A "diary day" is a YYYY-MM-DD string in the
 * USER'S timezone, not UTC — logging at 11 pm in Kolkata must land on that
 * local date regardless of what UTC thinks. Uses Intl (no date libraries);
 * all functions take explicit `timezone` + `now` so they are testable.
 */

import type { LocalDate } from '../api/types';

/** The diary day an instant belongs to in the given IANA timezone. */
export function diaryDayOf(instant: Date, timezone: string): LocalDate {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export function todayIn(timezone: string, now: () => Date = () => new Date()): LocalDate {
  return diaryDayOf(now(), timezone);
}

/** Add days to a LocalDate (pure calendar math, DST-safe because we never leave the date domain). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Monday-start week containing `date`. */
export function weekBoundsOf(date: LocalDate): { start: LocalDate; end: LocalDate } {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
  const sinceMonday = (dow + 6) % 7;
  const start = addDays(date, -sinceMonday);
  return { start, end: addDays(start, 6) };
}

/** Range [from..to] inclusive, ascending. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Human label: Today / Yesterday / Tomorrow / "Mon, Jul 14". */
export function friendlyDay(date: LocalDate, timezone: string, now: () => Date = () => new Date()): string {
  const today = todayIn(timezone, now);
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
