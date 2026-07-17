"use client";

/** Dashboard: today at a glance — budget ring, macros, water, meals, weight. */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flame, Plus, Dumbbell, Scale, ArrowRight, UtensilsCrossed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalorieRing } from "@/components/charts/calorie-ring";
import { MacroBars } from "@/components/charts/macro-bars";
import { WeightChart } from "@/components/charts/weight-chart";
import { WaterCard } from "@/components/diary/water-card";
import { LogFoodDialog } from "@/components/diary/log-food-dialog";
import { useProfile, useUser } from "@/lib/hooks/use-auth";
import { useDayEntries, useDaySummary, useGoal, useRangeEntries } from "@/lib/hooks/use-diary";
import { addDays, todayIn } from "@/lib/domain/dates";
import { roundHalfUp } from "@/lib/domain/nutrition";
import type { DiaryEntry, MealSlot } from "@/lib/api/types";
import { SyncBadge } from "@/components/sync/sync-badge";

const MEAL_LABELS: Record<MealSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks" };

function greeting(hour: number): string {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { data: user } = useUser();
  const { data: profile } = useProfile();
  const tz = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayIn(tz);
  const summary = useDaySummary(today);
  const goal = useGoal();
  const entries = useDayEntries(today);
  const [logOpen, setLogOpen] = useState(false);

  const weightWindow = useRangeEntries(addDays(today, -30), today);
  const weightData = useMemo(
    () =>
      (weightWindow ?? [])
        .filter((e): e is Extract<DiaryEntry, { kind: "weight" }> => e.kind === "weight")
        .map((e) => ({ date: e.date, weightKg: e.weightKg })),
    [weightWindow],
  );

  const meals = useMemo(() => {
    const foods = (entries ?? []).filter((e): e is Extract<DiaryEntry, { kind: "food" }> => e.kind === "food");
    return (Object.keys(MEAL_LABELS) as MealSlot[]).map((slot) => ({
      slot,
      items: foods.filter((f) => f.meal === slot),
      kcal: Math.round(foods.filter((f) => f.meal === slot).reduce((s, f) => s + f.nutrients.kcal, 0)),
    }));
  }, [entries]);

  const exerciseToday = (entries ?? []).filter((e): e is Extract<DiaryEntry, { kind: "exercise" }> => e.kind === "exercise");

  if (!summary || !goal) {
    return (
      <div className="space-y-5" aria-busy aria-label="Loading dashboard">
        <Skeleton className="h-8 w-64" />
        <div className="grid md:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-2xl md:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    );
  }

  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {greeting(hour)}, {user?.displayName?.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz }).format(new Date())}
          </p>
        </div>
        <Button onClick={() => setLogOpen(true)} data-testid="quick-log">
          <Plus className="size-4" aria-hidden /> Log food
        </Button>
      </div>

      {/* Budget + macros */}
      <div className="grid md:grid-cols-5 gap-4">
        <Card className="md:col-span-3">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="size-4.5 text-primary" aria-hidden /> Calorie budget
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center gap-6 pt-2">
            <CalorieRing consumed={summary.consumed.kcal} target={summary.goal.calorieTarget} remaining={summary.remainingKcal} />
            <div className="grid grid-cols-3 sm:grid-cols-1 gap-3 text-center sm:text-left w-full sm:w-auto">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Target</p>
                <p className="font-bold tnum">{summary.goal.calorieTarget.toLocaleString("en-US")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Eaten</p>
                <p className="font-bold tnum">{Math.round(summary.consumed.kcal).toLocaleString("en-US")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Exercise credit</p>
                <p className="font-bold tnum text-success">+{Math.round(summary.burnedExercise).toLocaleString("en-US")}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Macros</CardTitle>
          </CardHeader>
          <CardContent>
            <MacroBars
              proteinG={summary.consumed.proteinG}
              carbsG={summary.consumed.carbsG}
              fatG={summary.consumed.fatG}
              targets={summary.goal}
            />
          </CardContent>
        </Card>
      </div>

      {/* Meals + water/exercise/weight */}
      <div className="grid md:grid-cols-5 gap-4">
        <Card className="md:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <UtensilsCrossed className="size-4.5 text-primary" aria-hidden /> Today's meals
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/diary">
                Open diary <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {meals.map(({ slot, items, kcal }) => (
              <div key={slot} className="rounded-xl border p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-sm">{MEAL_LABELS[slot]}</p>
                  <p className="text-xs text-muted-foreground tnum">{kcal > 0 ? `${kcal.toLocaleString("en-US")} kcal` : ""}</p>
                </div>
                {items.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setLogOpen(true)}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    + Add {MEAL_LABELS[slot].toLowerCase()}
                  </button>
                ) : (
                  <ul className="space-y-1">
                    {items.map((f) => (
                      <li key={f.id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate">{f.foodName}</span>
                        <SyncBadge state={f.syncState} />
                        <span className="text-muted-foreground tnum shrink-0">{Math.round(f.nutrients.kcal)} kcal</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-4">
          <WaterCard date={today} targetMl={summary.goal.waterTargetMl} />

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Dumbbell className="size-4.5 text-primary" aria-hidden /> Exercise
              </CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/exercise">
                  Log <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {exerciseToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workouts yet today.</p>
              ) : (
                <ul className="space-y-1.5">
                  {exerciseToday.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 truncate">{e.name}</span>
                      <SyncBadge state={e.syncState} />
                      <span className="text-muted-foreground tnum shrink-0">
                        {e.durationMin} min · {e.caloriesBurned} kcal
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Weight trend */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="size-4.5 text-primary" aria-hidden /> Weight — last 30 days
          </CardTitle>
          <div className="flex items-center gap-2">
            {weightData.length >= 2 && (
              <p className="text-sm tnum">
                <span className="font-bold">{weightData[weightData.length - 1].weightKg} kg</span>{" "}
                <span
                  className={
                    weightData[weightData.length - 1].weightKg <= weightData[0].weightKg ? "text-success" : "text-warning"
                  }
                >
                  ({roundHalfUp(weightData[weightData.length - 1].weightKg - weightData[0].weightKg, 1) > 0 ? "+" : ""}
                  {roundHalfUp(weightData[weightData.length - 1].weightKg - weightData[0].weightKg, 1)} kg)
                </span>
              </p>
            )}
            <Button variant="ghost" size="sm" asChild>
              <Link href="/progress">
                Details <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <WeightChart data={weightData} height={200} />
        </CardContent>
      </Card>

      <LogFoodDialog open={logOpen} onOpenChange={setLogOpen} date={today} />
    </div>
  );
}
