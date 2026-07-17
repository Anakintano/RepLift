"use client";

/**
 * Onboarding wizard — 3 steps: goal → about you → computed targets.
 * Targets use the real Mifflin-St Jeor derivation (lib/domain/targets),
 * so the plan a user accepts is exactly what the app enforces.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Flame, TrendingDown, TrendingUp, Equal } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getClient } from "@/lib/api/client";
import { ACTIVITY_LABELS, deriveTargets, ageFromBirthDate } from "@/lib/domain/targets";
import { todayIn } from "@/lib/domain/dates";
import { logWeight } from "@/lib/log";
import { errorMessage } from "@/lib/api/problem";
import type { ActivityLevel, GoalType, Sex } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const GOALS: { value: GoalType; label: string; desc: string; icon: typeof TrendingDown }[] = [
  { value: "lose", label: "Lose weight", desc: "Steady, sustainable fat loss", icon: TrendingDown },
  { value: "maintain", label: "Maintain", desc: "Hold weight, build habits", icon: Equal },
  { value: "gain", label: "Build muscle", desc: "Lean gain with enough protein", icon: TrendingUp },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [goalType, setGoalType] = useState<GoalType>("lose");
  const [rate, setRate] = useState("0.5");
  const [sex, setSex] = useState<Sex>("male");
  const [birthDate, setBirthDate] = useState("2000-01-01");
  const [heightCm, setHeightCm] = useState("175");
  const [weightKg, setWeightKg] = useState("75");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayIn(tz);

  const heightNum = Number(heightCm);
  const weightNum = Number(weightKg);
  const age = useMemo(() => {
    try {
      return ageFromBirthDate(birthDate, today);
    } catch {
      return NaN;
    }
  }, [birthDate, today]);

  const aboutValid =
    Number.isFinite(heightNum) && heightNum >= 100 && heightNum <= 250 &&
    Number.isFinite(weightNum) && weightNum >= 25 && weightNum <= 350 &&
    Number.isFinite(age) && age >= 13 && age <= 110;

  const targets = useMemo(() => {
    if (!aboutValid) return null;
    return deriveTargets({
      sex,
      ageYears: age,
      heightCm: heightNum,
      weightKg: weightNum,
      activityLevel: activity,
      goalType,
      weeklyRateKg: Number(rate) || 0,
    });
  }, [aboutValid, sex, age, heightNum, weightNum, activity, goalType, rate]);

  const finish = useMutation({
    mutationFn: async () => {
      if (!targets) throw new Error("Complete the previous steps first.");
      const client = await getClient();
      await client.profile.update({
        sex,
        birthDate,
        heightCm: heightNum,
        activityLevel: activity,
        unitSystem: "metric",
        timezone: tz,
        onboardingCompleted: true,
      });
      await client.goals.create({
        goalType,
        weeklyRateKg: (goalType === "lose" ? -1 : goalType === "gain" ? 1 : 0) * (Number(rate) || 0),
        targetWeightKg: targetWeightKg ? Number(targetWeightKg) : undefined,
        calorieTarget: targets.calorieTarget,
        proteinTargetG: targets.proteinTargetG,
        carbsTargetG: targets.carbsTargetG,
        fatTargetG: targets.fatTargetG,
        waterTargetMl: targets.waterTargetMl,
        effectiveDate: today,
      });
      await logWeight(today, weightNum);
    },
    onSuccess: () => router.push("/dashboard"),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <main className="min-h-dvh bg-gradient-to-b from-background to-muted/50 flex flex-col items-center px-4 py-10">
      <Logo size={36} href={null} />

      {/* progress */}
      <div className="flex items-center gap-2 mt-8 mb-6" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/50" : "w-4 bg-muted")} />
        ))}
      </div>

      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        {step === 0 && (
          <>
            <h1 className="text-xl font-bold tracking-tight mb-1">What brings you to RepLift?</h1>
            <p className="text-sm text-muted-foreground mb-5">You can change this anytime in Settings.</p>
            <div className="space-y-3">
              {GOALS.map(({ value, label, desc, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGoalType(value)}
                  aria-pressed={goalType === value}
                  className={cn(
                    "w-full flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-colors",
                    goalType === value ? "border-primary bg-accent" : "border-border hover:border-primary/40",
                  )}
                >
                  <Icon className={cn("size-6", goalType === value ? "text-primary" : "text-muted-foreground")} aria-hidden />
                  <div>
                    <p className="font-semibold">{label}</p>
                    <p className="text-sm text-muted-foreground">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
            {goalType !== "maintain" && (
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="ob-rate">Pace ({goalType === "lose" ? "loss" : "gain"} per week)</Label>
                <Select value={rate} onValueChange={setRate}>
                  <SelectTrigger id="ob-rate" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.25">0.25 kg — gentle</SelectItem>
                    <SelectItem value="0.5">0.5 kg — recommended</SelectItem>
                    <SelectItem value="0.75">0.75 kg — ambitious</SelectItem>
                    <SelectItem value="1">1.0 kg — aggressive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button className="w-full mt-6" onClick={() => setStep(1)}>
              Continue <ArrowRight className="size-4" aria-hidden />
            </Button>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="text-xl font-bold tracking-tight mb-1">About you</h1>
            <p className="text-sm text-muted-foreground mb-5">Used only to calculate your energy needs.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="ob-sex">Sex</Label>
                <Select value={sex} onValueChange={(v) => setSex(v as Sex)}>
                  <SelectTrigger id="ob-sex" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">For the BMR formula.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-dob">Date of birth</Label>
                <Input id="ob-dob" type="date" value={birthDate} max={today} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-height">Height (cm)</Label>
                <Input id="ob-height" inputMode="numeric" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} aria-invalid={heightCm !== "" && !(heightNum >= 100 && heightNum <= 250)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-weight">Weight (kg)</Label>
                <Input id="ob-weight" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} aria-invalid={weightKg !== "" && !(weightNum >= 25 && weightNum <= 350)} />
              </div>
              {goalType !== "maintain" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ob-target">Goal weight (kg, optional)</Label>
                  <Input id="ob-target" inputMode="decimal" value={targetWeightKg} onChange={(e) => setTargetWeightKg(e.target.value)} />
                </div>
              )}
              <div className={cn("space-y-1.5", goalType === "maintain" && "col-span-2")}>
                <Label htmlFor="ob-activity">Activity level</Label>
                <Select value={activity} onValueChange={(v) => setActivity(v as ActivityLevel)}>
                  <SelectTrigger id="ob-activity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!aboutValid && (heightCm !== "175" || weightKg !== "75") && (
              <p className="text-xs text-destructive mt-3">Double-check the values — something looks out of range.</p>
            )}
            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={() => setStep(0)} className="flex-1">
                <ArrowLeft className="size-4" aria-hidden /> Back
              </Button>
              <Button onClick={() => setStep(2)} disabled={!aboutValid} className="flex-1">
                Continue <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          </>
        )}

        {step === 2 && targets && (
          <>
            <h1 className="text-xl font-bold tracking-tight mb-1">Your daily plan</h1>
            <p className="text-sm text-muted-foreground mb-5">
              Based on Mifflin-St Jeor: BMR {targets.bmr.toLocaleString("en-US")} kcal × activity = TDEE{" "}
              {targets.tdee.toLocaleString("en-US")} kcal
              {goalType !== "maintain" && `, adjusted for ${rate} kg/week`}.
            </p>

            <div className="rounded-2xl bg-primary/10 border border-primary/20 p-5 text-center mb-4">
              <Flame className="size-6 text-primary mx-auto mb-1" aria-hidden />
              <p className="text-3xl font-extrabold tnum">{targets.calorieTarget.toLocaleString("en-US")}</p>
              <p className="text-sm text-muted-foreground font-medium">calories per day</p>
              {targets.clampedToFloor && (
                <p className="text-xs text-warning mt-2">
                  Adjusted up to a safe minimum — faster isn't healthier.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              {(
                [
                  ["Protein", `${targets.proteinTargetG} g`, "var(--chart-2)"],
                  ["Carbs", `${targets.carbsTargetG} g`, "var(--chart-3)"],
                  ["Fat", `${targets.fatTargetG} g`, "var(--chart-4)"],
                  ["Water", `${(targets.waterTargetMl / 1000).toFixed(1)} L`, "var(--chart-5)"],
                ] as const
              ).map(([label, value, color]) => (
                <div key={label} className="rounded-xl border p-3 flex items-center gap-2.5">
                  <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
                  <div>
                    <p className="font-bold tnum leading-tight">{value}</p>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground mb-5">
              These are estimates to start from, not medical advice — adjust anytime as you learn what works.
            </p>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                <ArrowLeft className="size-4" aria-hidden /> Back
              </Button>
              <Button onClick={() => finish.mutate()} disabled={finish.isPending} className="flex-1">
                {finish.isPending ? "Setting up…" : (<><Check className="size-4" aria-hidden /> Start tracking</>)}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
