"use client";

/** Weight trend line (Recharts via shadcn ChartContainer). */

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { LocalDate } from "@/lib/api/types";

const config = {
  weightKg: { label: "Weight (kg)", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function WeightChart({
  data,
  targetKg,
  height = 240,
}: {
  data: Array<{ date: LocalDate; weightKg: number }>;
  targetKg?: number;
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        Log at least two weigh-ins to see your trend.
      </div>
    );
  }

  const values = data.map((d) => d.weightKg).concat(targetKg ? [targetKg] : []);
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);

  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
        />
        <YAxis domain={[min, max]} tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => `${v}`} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}
            />
          }
        />
        {targetKg && (
          <ReferenceLine
            y={targetKg}
            stroke="var(--success)"
            strokeDasharray="6 4"
            label={{ value: `Goal ${targetKg} kg`, position: "insideBottomRight", fill: "var(--success)", fontSize: 11 }}
          />
        )}
        <Area type="monotone" dataKey="weightKg" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#weightFill)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ChartContainer>
  );
}
