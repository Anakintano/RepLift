"use client";

/**
 * Conflict resolution dialog. Appears automatically when the outbox detects
 * that an entry was edited on another device. Shows both versions side by
 * side; the user keeps one. Nothing is discarded silently.
 */

import { useState } from "react";
import { GitMerge } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useConflicts } from "@/lib/hooks/use-sync-status";
import { resolveConflict } from "@/lib/sync/outbox";
import type { DiaryEntry } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function describeEntry(e: DiaryEntry): { title: string; detail: string } {
  switch (e.kind) {
    case "food":
      return { title: e.foodName, detail: `${e.quantity} × ${e.unitLabel} · ${Math.round(e.nutrients.kcal)} kcal` };
    case "water":
      return { title: "Water", detail: `${e.amountMl} ml` };
    case "exercise":
      return { title: e.name, detail: `${e.durationMin} min · ${e.caloriesBurned} kcal burned` };
    case "weight":
      return { title: "Weight", detail: `${e.weightKg} kg` };
    case "measurement":
      return { title: `Measurement (${e.site.replace(/_/g, " ")})`, detail: `${e.value}` };
  }
}

function VersionCard({
  heading,
  entry,
  selected,
  onSelect,
}: {
  heading: string;
  entry: DiaryEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const d = describeEntry(entry);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex-1 rounded-xl border-2 p-4 text-left transition-colors",
        selected ? "border-primary bg-accent" : "border-border hover:border-primary/40",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{heading}</p>
      <p className="font-semibold">{d.title}</p>
      <p className="text-sm text-muted-foreground tnum">{d.detail}</p>
      <p className="text-xs text-muted-foreground mt-2">
        Updated {new Date(entry.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
      </p>
    </button>
  );
}

export function ConflictDialog() {
  const conflicts = useConflicts();
  const [choice, setChoice] = useState<"mine" | "server">("mine");
  const [busy, setBusy] = useState(false);
  const current = conflicts?.[0];

  if (!current) return null;

  const onResolve = async () => {
    setBusy(true);
    try {
      await resolveConflict(current.entryId, choice);
      toast.success(choice === "mine" ? "Kept your version — re-syncing it now." : "Server version restored on this device.");
    } finally {
      setBusy(false);
      setChoice("mine");
    }
  };

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="size-5 text-destructive" aria-hidden />
            This entry changed on another device
          </DialogTitle>
          <DialogDescription>
            The same entry was edited in two places. Pick the version to keep — the other is discarded, and nothing
            else is affected.
            {conflicts.length > 1 && ` (${conflicts.length - 1} more conflict${conflicts.length > 2 ? "s" : ""} after this.)`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col sm:flex-row gap-3">
          <VersionCard heading="This device" entry={current.localEntry} selected={choice === "mine"} onSelect={() => setChoice("mine")} />
          <VersionCard heading="Other device" entry={current.serverEntry} selected={choice === "server"} onSelect={() => setChoice("server")} />
        </div>
        <DialogFooter>
          <Button onClick={() => void onResolve()} disabled={busy} className="w-full sm:w-auto">
            Keep selected version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
