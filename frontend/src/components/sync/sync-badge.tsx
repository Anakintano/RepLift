"use client";

/** Per-entry sync state dot shown next to diary rows. */

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SyncState } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const LABELS: Record<SyncState, string> = {
  synced: "Synced",
  pending: "Waiting to sync — saved on this device",
  failed: "Sync failed — entry is safe locally",
  conflict: "Conflict — needs your review",
};

export function SyncBadge({ state }: { state?: SyncState }) {
  if (!state || state === "synced") return null;
  return (
    <Tooltip>
      <TooltipTrigger aria-label={LABELS[state]}>
        <span
          className={cn(
            "inline-block size-2 rounded-full",
            state === "pending" && "bg-warning animate-pulse",
            state === "failed" && "bg-destructive",
            state === "conflict" && "bg-destructive ring-2 ring-destructive/30",
          )}
        />
      </TooltipTrigger>
      <TooltipContent>{LABELS[state]}</TooltipContent>
    </Tooltip>
  );
}
