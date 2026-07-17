"use client";

/** Exercise log: quick presets + custom entry form; history with delete. */

import { useState } from "react";
import { Dumbbell, Flame, Plus, Timer, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncBadge } from "@/components/sync/sync-badge";
import { useDayEntries, useRangeEntries } from "@/lib/hooks/use-diary";
import { useProfile } from "@/lib/hooks/use-auth";
import { addDays, friendlyDay, todayIn } from "@/lib/domain/dates";
import { logExercise } from "@/lib/log";
import { deleteEntry } from "@/lib/sync/outbox";
import type { DiaryEntry, ExerciseCategory } from "@/lib/api/types";
import { toast } from "sonner";

const PRESETS: Array<{ name: string; category: ExerciseCategory; durationMin: number; caloriesBurned: number }> = [
  { name: "Strength training", category: "strength", durationMin: 60, caloriesBurned: 300 },
  { name: "Running", category: "cardio", durationMin: 30, caloriesBurned: 320 },
  { name: "Cycling", category: "cardio", durationMin: 45, caloriesBurned: 380 },
  { name: "Walking", category: "cardio", durationMin: 30, caloriesBurned: 120 },
  { name: "Yoga", category: "flexibility", durationMin: 40, caloriesBurned: 140 },
  { name: "Swimming", category: "cardio", durationMin: 30, caloriesBurned: 260 },
];

const schema = z.object({
  name: z.string().min(2, "Name the workout"),
  category: z.enum(["cardio", "strength", "flexibility", "sports", "other"]),
  durationMin: z.coerce.number().positive("Must be above 0").max(1440, "That's more than a day"),
  caloriesBurned: z.coerce.number().min(0).max(10000, "Unrealistically high"),
  distanceKm: z.coerce.number().min(0).max(1000).optional().or(z.literal("")),
});

type FormValues = z.input<typeof schema>;

export default function ExercisePage() {
  const { data: profile } = useProfile();
  const tz = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayIn(tz);
  const entries = useDayEntries(today);
  const history = useRangeEntries(addDays(today, -14), addDays(today, -1));
  const [showForm, setShowForm] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", category: "strength", durationMin: 45, caloriesBurned: 250, distanceKm: "" },
  });

  const exToday = (entries ?? []).filter((e): e is Extract<DiaryEntry, { kind: "exercise" }> => e.kind === "exercise");
  const exHistory = (history ?? [])
    .filter((e): e is Extract<DiaryEntry, { kind: "exercise" }> => e.kind === "exercise")
    .sort((a, b) => b.date.localeCompare(a.date));

  const burned = exToday.reduce((s, e) => s + e.caloriesBurned, 0);
  const minutes = exToday.reduce((s, e) => s + e.durationMin, 0);

  const submit = form.handleSubmit(async (raw) => {
    const v = schema.parse(raw);
    await logExercise(today, {
      name: v.name,
      category: v.category,
      durationMin: v.durationMin,
      caloriesBurned: v.caloriesBurned,
      distanceKm: typeof v.distanceKm === "number" && v.distanceKm > 0 ? v.distanceKm : undefined,
    });
    toast.success(`${v.name} logged — +${v.caloriesBurned} kcal budget credit`);
    form.reset();
    setShowForm(false);
  });

  const logPreset = async (p: (typeof PRESETS)[number]) => {
    await logExercise(today, { ...p });
    toast.success(`${p.name} logged`);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <Dumbbell className="size-6 text-primary" aria-hidden /> Exercise
        </h1>
        <Button onClick={() => setShowForm((s) => !s)}>
          <Plus className="size-4" aria-hidden /> Log workout
        </Button>
      </div>

      {/* Today stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Flame className="size-8 text-primary" aria-hidden />
            <div>
              <p className="text-2xl font-extrabold tnum">{burned.toLocaleString("en-US")}</p>
              <p className="text-xs text-muted-foreground font-medium">kcal burned today</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Timer className="size-8 text-primary" aria-hidden />
            <div>
              <p className="text-2xl font-extrabold tnum">{minutes}</p>
              <p className="text-xs text-muted-foreground font-medium">active minutes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Custom form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Log a workout</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => void submit(e)} className="grid sm:grid-cols-2 gap-4" noValidate>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ex-name">Workout</Label>
                <Input id="ex-name" placeholder="e.g. Push day, 5k run" {...form.register("name")} aria-invalid={!!form.formState.errors.name} />
                {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-cat">Type</Label>
                <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v as ExerciseCategory)}>
                  <SelectTrigger id="ex-cat" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strength">Strength</SelectItem>
                    <SelectItem value="cardio">Cardio</SelectItem>
                    <SelectItem value="flexibility">Flexibility</SelectItem>
                    <SelectItem value="sports">Sports</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-dur">Duration (min)</Label>
                <Input id="ex-dur" inputMode="numeric" {...form.register("durationMin")} aria-invalid={!!form.formState.errors.durationMin} />
                {form.formState.errors.durationMin && <p className="text-xs text-destructive">{form.formState.errors.durationMin.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-kcal">Calories burned</Label>
                <Input id="ex-kcal" inputMode="numeric" {...form.register("caloriesBurned")} aria-invalid={!!form.formState.errors.caloriesBurned} />
                <p className="text-xs text-muted-foreground">Estimate is fine — it credits your calorie budget.</p>
                {form.formState.errors.caloriesBurned && <p className="text-xs text-destructive">{form.formState.errors.caloriesBurned.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-dist">Distance (km, optional)</Label>
                <Input id="ex-dist" inputMode="decimal" {...form.register("distanceKm")} />
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={form.formState.isSubmitting}>
                  Log workout
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Presets */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick log</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.name} variant="outline" size="sm" onClick={() => void logPreset(p)}>
              {p.name} · {p.durationMin} min
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Today + history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today</CardTitle>
        </CardHeader>
        <CardContent>
          {entries === undefined ? (
            <Skeleton className="h-16 rounded-xl" aria-busy />
          ) : exToday.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nothing logged yet — a 20-minute walk counts too.</p>
          ) : (
            <ul className="divide-y">
              {exToday.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{e.name}</p>
                    <p className="text-xs text-muted-foreground tnum">
                      {e.durationMin} min{e.distanceKm ? ` · ${e.distanceKm} km` : ""} · {e.category}
                    </p>
                  </div>
                  <SyncBadge state={e.syncState} />
                  <span className="text-sm tnum text-success shrink-0">+{e.caloriesBurned} kcal</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${e.name}`} onClick={() => void deleteEntry(e.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last 14 days</CardTitle>
        </CardHeader>
        <CardContent>
          {exHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Workout history appears here.</p>
          ) : (
            <ul className="divide-y">
              {exHistory.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{friendlyDay(e.date, tz)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{e.name}</p>
                  </div>
                  <span className="text-xs text-muted-foreground tnum">{e.durationMin} min</span>
                  <span className="text-sm tnum text-muted-foreground shrink-0">{e.caloriesBurned} kcal</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
