"use client";

/**
 * Weekly report — the same artifact the Phase-2 background job generates
 * and emails. Week navigation, adherence, averages, per-day chart.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileBarChart, Award, Flame, Droplets, Dumbbell, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WeekBars } from "@/components/charts/week-bars";
import { getClient } from "@/lib/api/client";
import { useProfile } from "@/lib/hooks/use-auth";
import { addDays, friendlyDay, todayIn, weekBoundsOf } from "@/lib/domain/dates";
import { errorMessage } from "@/lib/api/problem";
import { roundHalfUp } from "@/lib/domain/nutrition";

function fmtRange(start: string, end: string) {
  const f = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(start)} – ${f(end)}`;
}

export default function ReportsPage() {
  const { data: profile } = useProfile();
  const tz = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayIn(tz);
  const thisWeek = weekBoundsOf(today).start;
  const [weekStart, setWeekStart] = useState(thisWeek);

  const report = useQuery({
    queryKey: ["report", weekStart],
    queryFn: async () => (await getClient()).reports.weekly(weekStart),
  });

  const r = report.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <FileBarChart className="size-6 text-primary" aria-hidden /> Weekly report
        </h1>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center font-semibold text-sm">{fmtRange(weekStart, addDays(weekStart, 6))}</span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next week"
            disabled={weekStart >= thisWeek}
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {report.isPending ? (
        <div className="space-y-4" aria-busy aria-label="Loading report">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : report.isError ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-destructive font-medium mb-3">{errorMessage(report.error)}</p>
            <Button variant="outline" onClick={() => void report.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : r && r.daysLogged === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            <FileBarChart className="size-10 mx-auto mb-3 opacity-30" aria-hidden />
            <p className="font-medium text-foreground mb-1">Nothing logged this week</p>
            <p>Log a few days of meals and this report fills itself in.</p>
          </CardContent>
        </Card>
      ) : r ? (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <Flame className="size-3.5" aria-hidden /> Avg calories
                </div>
                <p className="text-2xl font-extrabold tnum">{Math.round(r.avgKcal).toLocaleString("en-US")}</p>
                <p className="text-xs text-muted-foreground tnum">target {r.perDay[0]?.target.toLocaleString("en-US")}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <Award className="size-3.5" aria-hidden /> Adherence
                </div>
                <p className="text-2xl font-extrabold tnum">{r.adherencePct}%</p>
                <p className="text-xs text-muted-foreground">days within ±10% of target</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <Dumbbell className="size-3.5" aria-hidden /> Workouts
                </div>
                <p className="text-2xl font-extrabold tnum">{r.exerciseSessions}</p>
                <p className="text-xs text-muted-foreground tnum">{r.exerciseMinutes} min · {r.caloriesBurned.toLocaleString("en-US")} kcal</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
                  <Scale className="size-3.5" aria-hidden /> Weight change
                </div>
                <p className={`text-2xl font-extrabold tnum ${r.weightChangeKg !== null && r.weightChangeKg <= 0 ? "text-success" : ""}`}>
                  {r.weightChangeKg === null ? "—" : `${r.weightChangeKg > 0 ? "+" : ""}${r.weightChangeKg} kg`}
                </p>
                <p className="text-xs text-muted-foreground">this week</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-day chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Calories by day</CardTitle>
            </CardHeader>
            <CardContent>
              <WeekBars data={r.perDay} target={r.perDay[0]?.target ?? 2000} height={240} />
            </CardContent>
          </Card>

          {/* Averages + highlights */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily averages ({r.daysLogged} logged days)</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2.5 text-sm">
                  {[
                    ["Protein", `${roundHalfUp(r.avgProteinG)} g`, "var(--chart-2)"],
                    ["Carbs", `${roundHalfUp(r.avgCarbsG)} g`, "var(--chart-3)"],
                    ["Fat", `${roundHalfUp(r.avgFatG)} g`, "var(--chart-4)"],
                    ["Water", `${(r.avgWaterMl / 1000).toFixed(1)} L`, "var(--chart-5)"],
                  ].map(([label, value, color]) => (
                    <div key={label as string} className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color as string }} aria-hidden />
                      <dt className="flex-1 text-muted-foreground">{label}</dt>
                      <dd className="font-semibold tnum">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Award className="size-4.5 text-primary" aria-hidden /> Highlights
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {r.bestDay && (
                  <p>
                    <span className="font-semibold">{friendlyDay(r.bestDay, tz)}</span> was your most on-target day.
                  </p>
                )}
                <p>
                  You logged <span className="font-semibold tnum">{r.daysLogged}/7</span> days
                  {r.daysLogged >= 6 ? " — excellent consistency." : r.daysLogged >= 4 ? " — solid. Aim for one more next week." : ". Consistency beats perfection — try logging just breakfast daily."}
                </p>
                {r.exerciseSessions > 0 && (
                  <p>
                    <span className="font-semibold tnum">{r.exerciseSessions}</span> workout{r.exerciseSessions === 1 ? "" : "s"} added{" "}
                    <span className="font-semibold tnum">{r.caloriesBurned.toLocaleString("en-US")} kcal</span> back to your budget.
                  </p>
                )}
                <p className="text-xs text-muted-foreground pt-2">
                  In Phase 2 this report is generated by a background job every Monday and emailed to you.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
