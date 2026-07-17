"use client";

/** Calories per day vs target (weekly report + trends). */

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis, Cell } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { LocalDate } from "@/lib/api/types";

const config = {
  kcal: { label: "Calories", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function WeekBars({
  data,
  target,
  height = 220,
}: {
  data: Array<{ date: LocalDate; kcal: number }>;
  target: number;
  height?: number;
}) {
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: 4, right: 8, top: 12, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}
        />
        <YAxis tickLine={false} axisLine={false} width={40} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
            />
          }
        />
        <ReferenceLine
          y={target}
          stroke="var(--muted-foreground)"
          strokeDasharray="6 4"
          label={{ value: `Target ${target.toLocaleString("en-US")}`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <Bar dataKey="kcal" radius={[6, 6, 0, 0]} maxBarSize={42}>
          {data.map((d) => (
            <Cell
              key={d.date}
              fill={d.kcal === 0 ? "var(--muted)" : Math.abs(d.kcal - target) / target <= 0.1 ? "var(--success)" : "var(--chart-1)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
