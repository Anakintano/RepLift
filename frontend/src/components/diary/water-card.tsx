"use client";

/** Water tracker: segmented glasses + quick add. Count always shown as text. */

import { GlassWater, Plus, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { LocalDate } from "@/lib/api/types";
import { useDayEntries } from "@/lib/hooks/use-diary";
import { logWater } from "@/lib/log";
import { deleteEntry } from "@/lib/sync/outbox";
import { cn } from "@/lib/utils";

const GLASS_ML = 250;

export function WaterCard({ date, targetMl }: { date: LocalDate; targetMl: number }) {
  const entries = useDayEntries(date);
  const waterEntries = (entries ?? []).filter((e) => e.kind === "water");
  const totalMl = waterEntries.reduce((s, e) => s + (e.kind === "water" ? e.amountMl : 0), 0);
  const glasses = Math.round(totalMl / GLASS_ML);
  const targetGlasses = Math.max(1, Math.round(targetMl / GLASS_ML));

  const removeLast = async () => {
    const last = waterEntries[waterEntries.length - 1];
    if (last) await deleteEntry(last.id);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <GlassWater className="size-4.5" style={{ color: "var(--chart-5)" }} aria-hidden />
          Water
        </CardTitle>
        <p className="text-sm text-muted-foreground tnum">
          {(totalMl / 1000).toFixed(2).replace(/\.?0+$/, "")} / {(targetMl / 1000).toFixed(1)} L
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5 mb-4" aria-hidden>
          {Array.from({ length: Math.max(targetGlasses, glasses) }).map((_, i) => (
            <GlassWater
              key={i}
              className={cn("size-6 transition-colors", i < glasses ? "" : "opacity-20")}
              style={{ color: i < glasses ? "var(--chart-5)" : undefined }}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => void logWater(date, GLASS_ML)}>
            <Plus className="size-4" aria-hidden /> Glass (250 ml)
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => void logWater(date, 500)}>
            <Plus className="size-4" aria-hidden /> Bottle (500 ml)
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove last water entry"
            disabled={waterEntries.length === 0}
            onClick={() => void removeLast()}
          >
            <Minus className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
