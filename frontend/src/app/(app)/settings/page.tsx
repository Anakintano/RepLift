"use client";

/**
 * Settings: profile & goals, notifications, privacy & data (export /
 * sessions / delete account). Data rights are first-class: export runs as a
 * (simulated) background job with progress; deletion requires password.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Download, ShieldCheck, Bell, UserRound, Target, MonitorSmartphone, Trash2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getClient } from "@/lib/api/client";
import { useProfile, useUser, useLogout } from "@/lib/hooks/use-auth";
import { useGoal } from "@/lib/hooks/use-diary";
import { deriveTargets, ageFromBirthDate, ACTIVITY_LABELS } from "@/lib/domain/targets";
import { todayIn } from "@/lib/domain/dates";
import { errorMessage } from "@/lib/api/problem";
import type {
  ActivityLevel,
  ExportJob,
  Goal,
  GoalType,
  NotificationPrefs,
  PrivacySettings,
  Profile as ProfileType,
} from "@/lib/api/types";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// ---------- Profile & goals tab ----------

function ProfileGoalsTab() {
  const { data: profile } = useProfile();
  const goal = useGoal();
  if (!profile || !goal) return <Skeleton className="h-72 rounded-2xl" aria-busy />;
  // key remounts the form when a new goal version lands, re-seeding its state
  return <ProfileGoalsForm key={`${profile.userId}:${goal.id}`} profile={profile} goal={goal} />;
}

function ProfileGoalsForm({ profile, goal }: { profile: ProfileType; goal: Goal }) {
  const qc = useQueryClient();
  const [heightCm, setHeightCm] = useState(String(profile.heightCm));
  const [activity, setActivity] = useState<ActivityLevel>(profile.activityLevel);
  const [goalType, setGoalType] = useState<GoalType>(goal.goalType);
  const [rate, setRate] = useState(String(Math.abs(goal.weeklyRateKg) || 0.5));

  const save = useMutation({
    mutationFn: async () => {
      const client = await getClient();
      const p = await client.profile.update({
        heightCm: Number(heightCm),
        activityLevel: activity as ActivityLevel,
      });
      // recompute targets from latest weight + new settings; creates a new goal version
      const weightKg = goal.targetWeightKg ?? 80;
      const targets = deriveTargets({
        sex: p.sex,
        ageYears: ageFromBirthDate(p.birthDate, todayIn(p.timezone)),
        heightCm: p.heightCm,
        weightKg,
        activityLevel: p.activityLevel,
        goalType,
        weeklyRateKg: Number(rate) || 0,
      });
      await client.goals.create({
        goalType,
        weeklyRateKg: (goalType === "lose" ? -1 : 1) * (Number(rate) || 0),
        targetWeightKg: goal.targetWeightKg,
        calorieTarget: targets.calorieTarget,
        proteinTargetG: targets.proteinTargetG,
        carbsTargetG: targets.carbsTargetG,
        fatTargetG: targets.fatTargetG,
        waterTargetMl: targets.waterTargetMl,
        effectiveDate: todayIn(p.timezone),
      });
      return targets;
    },
    onSuccess: (t) => {
      toast.success(`Targets updated — ${t.calorieTarget} kcal/day from today onward`, {
        description: "Past days keep the goals that were active then.",
      });
      void qc.invalidateQueries({ queryKey: ["goal"] });
      void qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserRound className="size-4.5 text-primary" aria-hidden /> Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="st-height">Height (cm)</Label>
            <Input id="st-height" inputMode="numeric" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="st-activity">Activity level</Label>
            <Select value={activity} onValueChange={(v) => setActivity(v as ActivityLevel)}>
              <SelectTrigger id="st-activity" className="w-full">
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
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input value={profile.timezone} disabled aria-label="Timezone (from your device)" />
            <p className="text-xs text-muted-foreground">Diary days roll over at midnight in this timezone.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Units</Label>
            <Input value={profile.unitSystem === "metric" ? "Metric (kg, cm, ml)" : "Imperial"} disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="size-4.5 text-primary" aria-hidden /> Goal
          </CardTitle>
          <CardDescription>
            Changing your goal creates a new goal version effective today — historical days keep their original targets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="st-goaltype">Goal</Label>
              <Select value={goalType} onValueChange={(v) => setGoalType(v as GoalType)}>
                <SelectTrigger id="st-goaltype" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lose">Lose weight</SelectItem>
                  <SelectItem value="maintain">Maintain</SelectItem>
                  <SelectItem value="gain">Build muscle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {goalType !== "maintain" && (
              <div className="space-y-1.5">
                <Label htmlFor="st-rate">Pace (kg per week)</Label>
                <Select value={rate} onValueChange={setRate}>
                  <SelectTrigger id="st-rate" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.25">0.25 — gentle</SelectItem>
                    <SelectItem value="0.5">0.5 — recommended</SelectItem>
                    <SelectItem value="0.75">0.75 — ambitious</SelectItem>
                    <SelectItem value="1">1.0 — aggressive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="rounded-xl bg-muted/60 p-3 text-sm grid grid-cols-2 sm:grid-cols-5 gap-2 text-center tnum">
            <div>
              <p className="font-bold">{goal.calorieTarget.toLocaleString("en-US")}</p>
              <p className="text-[11px] text-muted-foreground">kcal/day</p>
            </div>
            <div>
              <p className="font-bold">{goal.proteinTargetG} g</p>
              <p className="text-[11px] text-muted-foreground">protein</p>
            </div>
            <div>
              <p className="font-bold">{goal.carbsTargetG} g</p>
              <p className="text-[11px] text-muted-foreground">carbs</p>
            </div>
            <div>
              <p className="font-bold">{goal.fatTargetG} g</p>
              <p className="text-[11px] text-muted-foreground">fat</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="font-bold">{(goal.waterTargetMl / 1000).toFixed(1)} L</p>
              <p className="text-[11px] text-muted-foreground">water</p>
            </div>
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Recalculating…" : "Save & recalculate targets"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Notifications tab ----------

function NotificationsTab() {
  const qc = useQueryClient();
  const prefs = useQuery({
    queryKey: ["notification-prefs"],
    queryFn: async () => (await getClient()).account.getNotificationPrefs(),
  });

  const update = useMutation({
    mutationFn: async (next: NotificationPrefs) => (await getClient()).account.updateNotificationPrefs(next),
    onSuccess: (next) => {
      qc.setQueryData(["notification-prefs"], next);
      toast.success("Notification preferences saved");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (prefs.isPending) return <Skeleton className="h-64 rounded-2xl" aria-busy />;
  if (prefs.isError)
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm">
          <p className="text-destructive mb-3">{errorMessage(prefs.error)}</p>
          <Button size="sm" variant="outline" onClick={() => void prefs.refetch()}>Try again</Button>
        </CardContent>
      </Card>
    );

  const p = prefs.data!;
  const rows: { key: keyof NotificationPrefs; label: string; desc: string }[] = [
    { key: "mealReminders", label: "Meal reminders", desc: "A nudge if a usual mealtime passes unlogged." },
    { key: "waterReminders", label: "Water reminders", desc: "Gentle hydration reminders through the day." },
    { key: "weeklyReportEmail", label: "Weekly report email", desc: "Your Monday summary, straight to your inbox." },
    { key: "weighInReminder", label: "Weigh-in reminder", desc: "Morning reminder on your weigh-in days." },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="size-4.5 text-primary" aria-hidden /> Notifications
        </CardTitle>
        <CardDescription>Delivery starts in Phase 2 — preferences are honored from day one.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 py-3.5">
            <div>
              <Label htmlFor={`nt-${row.key}`} className="font-medium">{row.label}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{row.desc}</p>
            </div>
            <Switch
              id={`nt-${row.key}`}
              checked={p[row.key]}
              onCheckedChange={(v) => update.mutate({ ...p, [row.key]: v })}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------- Privacy & data tab ----------

function PrivacyDataTab() {
  const qc = useQueryClient();
  const router = useRouter();
  const logout = useLogout();
  const { data: user } = useUser();
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");

  const privacy = useQuery({
    queryKey: ["privacy"],
    queryFn: async () => (await getClient()).account.getPrivacy(),
  });

  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => (await getClient()).auth.sessions(),
  });

  const updatePrivacy = useMutation({
    mutationFn: async (next: PrivacySettings) => (await getClient()).account.updatePrivacy(next),
    onSuccess: (next) => {
      qc.setQueryData(["privacy"], next);
      toast.success("Privacy settings saved");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => (await getClient()).auth.revokeSession(id),
    onSuccess: () => {
      toast.success("Session revoked");
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // poll export job while running
  useEffect(() => {
    if (!exportJob || exportJob.status === "done" || exportJob.status === "failed") return;
    const t = setTimeout(async () => {
      try {
        const client = await getClient();
        setExportJob(await client.account.exportStatus(exportJob.id));
      } catch (e) {
        toast.error(errorMessage(e));
        setExportJob(null);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [exportJob]);

  const startExport = async () => {
    try {
      const client = await getClient();
      setExportJob(await client.account.requestExport());
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const doDelete = useMutation({
    mutationFn: async () => (await getClient()).account.deleteAccount(deletePw),
    onSuccess: () => {
      toast.success("Your account and data have been deleted.");
      router.push("/");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      {/* Privacy toggles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="size-4.5 text-primary" aria-hidden /> Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {privacy.isPending ? (
            <Skeleton className="h-20 rounded-xl" aria-busy />
          ) : privacy.data ? (
            <>
              <div className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <Label htmlFor="pv-ai" className="font-medium">AI features</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Natural-language logging sends your meal description (never your history) to the AI provider.
                  </p>
                </div>
                <Switch
                  id="pv-ai"
                  checked={privacy.data.aiFeaturesEnabled}
                  onCheckedChange={(v) => updatePrivacy.mutate({ ...privacy.data!, aiFeaturesEnabled: v })}
                />
              </div>
              <div className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <Label htmlFor="pv-analytics" className="font-medium">Opt out of product analytics</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Anonymous usage metrics only — never your health data.</p>
                </div>
                <Switch
                  id="pv-analytics"
                  checked={privacy.data.analyticsOptOut}
                  onCheckedChange={(v) => updatePrivacy.mutate({ ...privacy.data!, analyticsOptOut: v })}
                />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MonitorSmartphone className="size-4.5 text-primary" aria-hidden /> Active sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.isPending ? (
            <Skeleton className="h-24 rounded-xl" aria-busy />
          ) : sessions.isError ? (
            <p className="text-sm text-destructive">{errorMessage(sessions.error)}</p>
          ) : (
            <ul className="divide-y">
              {sessions.data!.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {s.device} {s.current && <span className="text-xs text-success font-semibold">· current</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last active {new Date(s.lastActiveAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {s.ip}
                    </p>
                  </div>
                  {!s.current && (
                    <Button variant="outline" size="sm" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending}>
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="size-4.5 text-primary" aria-hidden /> Export your data
          </CardTitle>
          <CardDescription>
            Everything you've logged — profile, goals, diary, recipes — as JSON. Runs as a background job.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {exportJob && exportJob.status !== "done" ? (
            <div className="space-y-2" aria-live="polite">
              <div className="flex items-center gap-2 text-sm">
                <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
                Preparing your export… {exportJob.progressPct}%
              </div>
              <Progress value={exportJob.progressPct} />
            </div>
          ) : exportJob?.status === "done" && exportJob.downloadUrl ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild>
                <a href={exportJob.downloadUrl} download={`replift-export-${user?.displayName ?? "me"}.json`}>
                  <Download className="size-4" aria-hidden /> Download JSON
                </a>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setExportJob(null)}>
                Start a new export
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => void startExport()}>
              Request export
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <Trash2 className="size-4.5" aria-hidden /> Delete account
          </CardTitle>
          <CardDescription>
            Credentials and sessions are removed immediately; diary data, recipes and exports are purged shortly after.
            This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Delete my account…
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              All your nutrition history, recipes, and settings will be erased. Consider exporting your data first.
              Enter your password to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="del-pw">Password</Label>
            <Input id="del-pw" type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} autoComplete="current-password" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletePw("")}>Keep my account</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deletePw.length === 0 || doDelete.isPending}
              onClick={(e) => {
                e.preventDefault();
                doDelete.mutate();
              }}
            >
              {doDelete.isPending ? "Deleting…" : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="text-xs text-muted-foreground px-1">
        Signed in as {user?.email}.{" "}
        <button type="button" className="underline hover:text-foreground" onClick={() => logout.mutate()}>
          Log out
        </button>
      </p>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
        <Settings className="size-6 text-primary" aria-hidden /> Settings
      </h1>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile & goals</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="privacy">Privacy & data</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          <ProfileGoalsTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationsTab />
        </TabsContent>
        <TabsContent value="privacy" className="mt-4">
          <PrivacyDataTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
