"use client";

/**
 * Macro progress bars with explicit value/target text (never color-only).
 * Fixed chart-slot colors: protein = chart-2, carbs = chart-3, fat = chart-4.
 */

import { progressPct, roundHalfUp } from "@/lib/domain/nutrition";
import { cn } from "@/lib/utils";

interface MacroRow {
  label: string;
  value: number;
  target: number;
  colorVar: string;
}

export function MacroBars({
  proteinG,
  carbsG,
  fatG,
  targets,
  className,
}: {
  proteinG: number;
  carbsG: number;
  fatG: number;
  targets: { proteinTargetG: number; carbsTargetG: number; fatTargetG: number };
  className?: string;
}) {
  const rows: MacroRow[] = [
    { label: "Protein", value: proteinG, target: targets.proteinTargetG, colorVar: "var(--chart-2)" },
    { label: "Carbs", value: carbsG, target: targets.carbsTargetG, colorVar: "var(--chart-3)" },
    { label: "Fat", value: fatG, target: targets.fatTargetG, colorVar: "var(--chart-4)" },
  ];

  return (
    <div className={cn("space-y-3.5", className)}>
      {rows.map((row) => {
        const pct = progressPct(row.value, row.target);
        const over = row.value > row.target * 1.05;
        return (
          <div key={row.label}>
            <div className="flex items-baseline justify-between text-sm mb-1">
              <span className="font-medium">{row.label}</span>
              <span className={cn("tnum text-muted-foreground", over && "text-destructive font-medium")}>
                {roundHalfUp(row.value)} / {row.target} g
              </span>
            </div>
            <div
              className="h-2 rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-label={`${row.label}: ${roundHalfUp(row.value)} of ${row.target} grams`}
              aria-valuenow={roundHalfUp(row.value)}
              aria-valuemin={0}
              aria-valuemax={row.target}
            >
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${pct * 100}%`, backgroundColor: over ? "var(--destructive)" : row.colorVar }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
