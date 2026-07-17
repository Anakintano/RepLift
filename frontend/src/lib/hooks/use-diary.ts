"use client";

/**
 * Diary data hooks — offline-first: the UI reads the device `entries` table
 * via live queries (instant, works offline); hydration from the server
 * happens in the background when online.
 */

import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { db } from '../db';
import { getClient } from '../api/client';
import type { DiaryEntry, Goal, LocalDate } from '../api/types';
import { computeDaySummary } from '../domain/summary';
import { addDays } from '../domain/dates';
import { hydrateFromServer } from '../sync/outbox';

export function useDayEntries(date: LocalDate): DiaryEntry[] | undefined {
  return useLiveQuery(
    async () => {
      const rows = await db.entries.where('date').equals(date).toArray();
      return rows.filter((e) => !e.deleted).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
    },
    [date],
  );
}

export function useRangeEntries(from: LocalDate, to: LocalDate): DiaryEntry[] | undefined {
  return useLiveQuery(
    async () => {
      const rows = await db.entries.where('date').between(from, to, true, true).toArray();
      return rows.filter((e) => !e.deleted).sort((a, b) => a.date.localeCompare(b.date));
    },
    [from, to],
  );
}

export function useGoal(): Goal | undefined {
  const { data } = useQuery({
    queryKey: ['goal', 'current'],
    queryFn: async () => (await getClient()).goals.current(),
    staleTime: 5 * 60_000,
  });
  return data;
}

/** Day summary computed locally from live entries — correct even offline. */
export function useDaySummary(date: LocalDate) {
  const entries = useDayEntries(date);
  const goal = useGoal();
  if (!entries || !goal) return undefined;
  return computeDaySummary(date, entries, goal);
}

/** Background hydration of the device cache for a window around today. */
export function useDiaryHydration(today: LocalDate) {
  useEffect(() => {
    void hydrateFromServer(addDays(today, -45), addDays(today, 1));
  }, [today]);
}
