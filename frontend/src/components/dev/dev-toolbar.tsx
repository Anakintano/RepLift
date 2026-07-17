"use client";

/**
 * Chaos toolbar (dev builds only): force offline, add latency, inject
 * failures, kill the AI provider, simulate another device editing an entry,
 * and reset the demo dataset. This is how every loading/offline/failure/
 * conflict state in the app is demonstrated.
 */

import { useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { useDevSim } from "@/lib/stores/dev-sim";
import { getClient } from "@/lib/api/client";
import { updateEntry } from "@/lib/sync/outbox";
import { db } from "@/lib/db";
import { todayIn, addDays } from "@/lib/domain/dates";
import { toast } from "sonner";

const HTTP_MODE = process.env.NEXT_PUBLIC_API_MODE === "http";

export function DevToolbar() {
  const [open, setOpen] = useState(false);
  const sim = useDevSim();

  if (process.env.NODE_ENV === "production") return null;

  /**
   * Real two-device conflict, mode-agnostic: push an edit through the public
   * sync API using the SERVER's revision (the "other device"), then edit the
   * same entry locally with the now-stale revision → conflict on next sync.
   */
  const triggerConflict = async () => {
    const client = await getClient();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const today = todayIn(tz);
    const serverEntries = await client.diary.range(addDays(today, -7), today);
    const target = [...serverEntries].reverse().find((e) => e.kind === "food");
    if (!target || target.kind !== "food") {
      toast.error("No food entry found to conflict with — log something first.");
      return;
    }
    await client.sync.push([
      {
        idempotencyKey: crypto.randomUUID(),
        queuedAt: new Date().toISOString(),
        attempts: 0,
        mutation: {
          op: "update",
          entity: "diary_entry",
          id: target.id,
          baseRevision: target.revision,
          data: { quantity: target.quantity * 2, grams: target.grams * 2, updatedAt: new Date().toISOString() },
        },
      },
    ]);
    const local = await db.entries.get(target.id);
    if (local?.kind === "food") {
      await updateEntry(target.id, { quantity: local.quantity + 0.01 });
      toast.info("Another device edited an entry, then this device edited it too. Watch the sync status…");
    } else {
      toast.info("Server-side edit applied — hydrate and edit the same entry to see the conflict.");
    }
  };

  const resetDevice = async () => {
    if (HTTP_MODE) {
      await Promise.all([db.entries.clear(), db.outbox.clear(), db.conflicts.clear()]);
    } else {
      const { resetDemoData } = await import("@/lib/api/mock");
      await resetDemoData();
    }
    location.reload();
  };

  return (
    <div className="fixed bottom-20 right-3 md:bottom-4 z-50 print:hidden" data-testid="dev-toolbar">
      {open ? (
        <div className="glass rounded-2xl shadow-xl p-4 w-72 space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-bold flex items-center gap-1.5">
              <FlaskConical className="size-4 text-primary" aria-hidden /> Failure simulator
            </p>
            <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Close dev toolbar">
              <X className="size-4" />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="sim-offline">Force offline</Label>
            <Switch id="sim-offline" checked={sim.forceOffline} onCheckedChange={sim.setForceOffline} />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="sim-ai">AI provider down</Label>
            <Switch id="sim-ai" checked={sim.aiDown} onCheckedChange={sim.setAiDown} />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label htmlFor="sim-latency">Latency</Label>
              <span className="text-muted-foreground tnum">{sim.latencyMs} ms</span>
            </div>
            <Slider id="sim-latency" min={0} max={3000} step={50} value={[sim.latencyMs]} onValueChange={([v]) => sim.setLatencyMs(v)} />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between">
              <Label htmlFor="sim-failure">Failure rate</Label>
              <span className="text-muted-foreground tnum">{Math.round(sim.failureRate * 100)}%</span>
            </div>
            <Slider id="sim-failure" min={0} max={1} step={0.1} value={[sim.failureRate]} onValueChange={([v]) => sim.setFailureRate(v)} />
          </div>

          <Separator />

          <div className="grid gap-2">
            <Button variant="outline" size="sm" onClick={() => void triggerConflict()}>
              Simulate two-device conflict
            </Button>
            <Button variant="outline" size="sm" onClick={() => void resetDevice()}>
              {HTTP_MODE ? "Clear device cache" : "Reset demo data"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="icon"
          variant="secondary"
          className="rounded-full shadow-lg border"
          onClick={() => setOpen(true)}
          aria-label="Open failure simulator"
        >
          <FlaskConical className="size-5" />
        </Button>
      )}
    </div>
  );
}
