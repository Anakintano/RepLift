"use client";

/**
 * Global sync status pill (header). States: offline / syncing / conflict /
 * error / synced. Clicking opens a detail popover with pending counts and a
 * manual "sync now" action.
 */

import { Cloud, CloudOff, Loader2, AlertTriangle, RefreshCw, GitMerge } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useSyncStatus } from "@/lib/hooks/use-sync-status";
import { processOutbox } from "@/lib/sync/outbox";
import { cn } from "@/lib/utils";

const CONFIG = {
  offline: { icon: CloudOff, label: "Offline", cls: "text-warning bg-warning/10 border-warning/30" },
  syncing: { icon: Loader2, label: "Syncing", cls: "text-primary bg-primary/10 border-primary/30" },
  conflict: { icon: GitMerge, label: "Conflict", cls: "text-destructive bg-destructive/10 border-destructive/30" },
  error: { icon: AlertTriangle, label: "Sync issue", cls: "text-destructive bg-destructive/10 border-destructive/30" },
  synced: { icon: Cloud, label: "Synced", cls: "text-muted-foreground bg-muted border-transparent" },
} as const;

export function SyncIndicator() {
  const status = useSyncStatus();
  const { icon: Icon, label, cls } = CONFIG[status.state];

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
          cls,
        )}
        aria-label={`Sync status: ${label}`}
      >
        <Icon className={cn("size-3.5", status.state === "syncing" && "animate-spin")} aria-hidden />
        <span className="hidden sm:inline">{label}</span>
        {status.pending > 0 && <span className="tnum">{status.pending}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm">
        <p className="font-semibold mb-1">
          {status.state === "offline" && "You're offline"}
          {status.state === "syncing" && "Syncing your changes"}
          {status.state === "conflict" && "Sync conflict needs your review"}
          {status.state === "error" && "Some changes couldn't sync"}
          {status.state === "synced" && "Everything is up to date"}
        </p>
        <p className="text-muted-foreground mb-3">
          {status.state === "offline"
            ? "Keep logging — entries are saved on this device and will sync automatically when you reconnect."
            : status.pending > 0
              ? `${status.pending} change${status.pending === 1 ? "" : "s"} waiting to sync.`
              : "All entries are safely stored on the server."}
        </p>
        {status.conflicts > 0 && (
          <p className="text-destructive mb-3">
            {status.conflicts} entr{status.conflicts === 1 ? "y" : "ies"} edited on another device — resolve below.
          </p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={!status.online}
          onClick={() => void processOutbox()}
        >
          <RefreshCw className="size-3.5" aria-hidden /> Sync now
        </Button>
      </PopoverContent>
    </Popover>
  );
}
