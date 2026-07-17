"use client";

/** Progress: weight trend + log weigh-in, measurements, calorie trend. */

import { useMemo, useState } from "react";
import { Scale, TrendingUp, Ruler, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeightChart } from "@/components/charts/weight-chart";
import { WeekBars } from "@/components/charts/week-bars";
import { useGoal, useRangeEntries } from "@/lib/hooks/use-diary";
import { useProfile } from "@/lib/hooks/use-auth";
import { addDays, dateRange, todayIn } from "@/lib/domain/dates";
import { roundHalfUp } from "@/lib/domain/nutrition";
import { logMeasurement, logWeight } from "@/lib/log";
import type { DiaryEntry, MeasurementSite } from "@/lib/api/types";
import { toast } from "sonner";

const RANGES = [
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
] as const;

const SITES: { value: MeasurementSite; label: string; unit: string }[] = [
  { value: "waist", label: "Waist", unit: "cm" },
  { value: "chest", label: "Chest", unit: "cm" },
  { value: "hips", label: "Hips", unit: "cm" },
  { value: "left_arm", label: "Left arm", unit: "cm" },
  { value: "right_arm", label: "Right arm", unit: "cm" },
  { value: "left_thigh", label: "Left thigh", unit: "cm" },
  { value: "right_thigh", label: "Right thigh", unit: "cm" },
  { value: "neck", label: "Neck", unit: "cm" },
  { value: "body_fat_pct", label: "Body fat", unit: "%" },
];

function LogWeightDialog({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const v = Number(value);
  const valid = Number.isFinite(v) && v >= 20 && v <= 400;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden /> Weigh-in
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Log weight</DialogTitle>
          <DialogDescription>Weigh at the same time each day for the cleanest trend.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="weight-kg">Weight (kg)</Label>
          <Input id="weight-kg" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus aria-invalid={value !== "" && !valid} />
          {value !== "" && !valid && <p className="text-xs text-destructive">Enter a weight between 20 and 400 kg.</p>}
        </div>
        <Button
          disabled={!valid}
          onClick={() => {
            void logWeight(today, roundHalfUp(v, 1)).then(() => {
              toast.success(`${roundHalfUp(v, 1)} kg logged`);
              setOpen(false);
              setValue("");
            });
          }}
        >
          Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function LogMeasurementDialog({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  const [site, setSite] = useState<MeasurementSite>("waist");
  const [value, setValue] = useState("");
  const v = Number(value);
  const valid = Number.isFinite(v) && v > 0 && v < 400;
  const unit = SITES.find((s) => s.value === site)!.unit;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" aria-hidden /> Measurement
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Log measurement</DialogTitle>
          <DialogDescription className="sr-only">Record a body measurement</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="m-site">Site</Label>
          <Select value={site} onValueChange={(s) => setSite(s as MeasurementSite)}>
            <SelectTrigger id="m-site" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SITES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="m-value">Value ({unit})</Label>
          <Input id="m-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={value !== "" && !valid} />
        </div>
        <Button
          disabled={!valid}
          onClick={() => {
            void logMeasurement(today, site, roundHalfUp(v, 1)).then(() => {
              toast.success("Measurement logged");
              setOpen(false);
              setValue("");
            });
          }}
        >
          Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function ProgressPage() {
  const { data: profile } = useProfile();
  const goal = useGoal();
  const tz = profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayIn(tz);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30");
  const days = RANGES.find((r) => r.key === range)!.days;

  const entries = useRangeEntries(addDays(today, -days), today);

  const weightData = useMemo(
    () =>
      (entries ?? [])
        .filter((e): e is Extract<DiaryEntry, { kind: "weight" }> => e.kind === "weight")
        .map((e) => ({ date: e.date, weightKg: e.weightKg })),
    [entries],
  );

  const calorieData = useMemo(() => {
    const foods = (entries ?? []).filter((e): e is Extract<DiaryEntry, { kind: "food" }> => e.kind === "food");
    return dateRange(addDays(today, -13), today).map((date) => ({
      date,
      kcal: Math.round(foods.filter((f) => f.date === date).reduce((s, f) => s + f.nutrients.kcal, 0)),
    }));
  }, [entries, today]);

  const measurements = useMemo(() => {
    const ms = (entries ?? []).filter((e): e is Extract<DiaryEntry, { kind: "measurement" }> => e.kind === "measurement");
    return SITES.map((site) => {
      const rows = ms.filter((m) => m.site === site.value).sort((a, b) => a.date.localeCompare(b.date));
      if (rows.length === 0) return null;
      const latest = rows[rows.length - 1];
      const first = rows[0];
      return { ...site, latest: latest.value, delta: roundHalfUp(latest.value - first.value, 1) };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
  }, [entries]);

  const startWeight = weightData[0]?.weightKg;
  const currentWeight = weightData[weightData.length - 1]?.weightKg;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <TrendingUp className="size-6 text-primary" aria-hidden /> Progress
        </h1>
        <div className="flex items-center gap-2">
          <LogMeasurementDialog today={today} />
          <LogWeightDialog today={today} />
        </div>
      </div>

      <Tabs value={range} onValueChange={(v) => setRange(v as typeof range)}>
        <TabsList>
          {RANGES.map((r) => (
            <TabsTrigger key={r.key} value={r.key}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Weight */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="size-4.5 text-primary" aria-hidden /> Weight
          </CardTitle>
          {currentWeight && startWeight && (
            <p className="text-sm tnum">
              <span className="font-bold">{currentWeight} kg</span>{" "}
              <span className={currentWeight <= startWeight ? "text-success" : "text-warning"}>
                ({currentWeight - startWeight > 0 ? "+" : ""}
                {roundHalfUp(currentWeight - startWeight, 1)} kg)
              </span>
            </p>
          )}
        </CardHeader>
        <CardContent>
          <WeightChart data={weightData} targetKg={goal?.targetWeightKg} height={260} />
        </CardContent>
      </Card>

      {/* Calories trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calories — last 14 days</CardTitle>
        </CardHeader>
        <CardContent>
          {goal ? <WeekBars data={calorieData} target={goal.calorieTarget} height={220} /> : null}
          <p className="text-xs text-muted-foreground mt-2">
            Green bars are within ±10% of your target. Empty days show as gaps — that's fine, life happens.
          </p>
        </CardContent>
      </Card>

      {/* Measurements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ruler className="size-4.5 text-primary" aria-hidden /> Measurements
          </CardTitle>
        </CardHeader>
        <CardContent>
          {measurements.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Track waist, chest, arms and more — often more telling than the scale.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {measurements.map((m) => (
                <div key={m.value} className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground font-medium">{m.label}</p>
                  <p className="text-lg font-bold tnum">
                    {m.latest} {m.unit}
                  </p>
                  <p className={`text-xs tnum ${m.delta <= 0 ? "text-success" : "text-warning"}`}>
                    {m.delta > 0 ? "+" : ""}
                    {m.delta} {m.unit} in {range} days
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
