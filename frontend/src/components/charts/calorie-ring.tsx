"use client";

/**
 * Calories-remaining radial gauge. Numeric value + label always visible in
 * the center (never color-only). Over-budget flips the ring to destructive.
 */

import { progressPct } from "@/lib/domain/nutrition";
import { cn } from "@/lib/utils";

export function CalorieRing({
  consumed,
  target,
  remaining,
  size = 176,
}: {
  consumed: number;
  target: number;
  remaining: number;
  size?: number;
}) {
  const stroke = size * 0.075;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = progressPct(consumed, target);
  const over = remaining < 0;

  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={`${Math.abs(Math.round(remaining))} calories ${over ? "over budget" : "remaining"} of ${Math.round(target)} target`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className={cn("transition-[stroke-dashoffset] duration-500 ease-out", over ? "stroke-destructive" : "stroke-primary")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-3xl font-extrabold tnum leading-none", over && "text-destructive")}>
          {Math.abs(Math.round(remaining)).toLocaleString("en-US")}
        </span>
        <span className="text-xs font-medium text-muted-foreground mt-1">{over ? "kcal over" : "kcal left"}</span>
      </div>
    </div>
  );
}
