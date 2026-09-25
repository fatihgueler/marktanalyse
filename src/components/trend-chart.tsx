"use client";

import { Area, AreaChart, CartesianGrid, ReferenceArea, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatWeek } from "@/lib/format";
import type { TrendPoint } from "@/sources/types";


interface TrendChartProps {
  series: TrendPoint[];
  /** z. B. „Suchinteresse“ oder „TikTok-Popularität“ */
  metricLabel: string;
  recentWeeks: number;
  previousWeeks: number;
}

/** Wochenverlauf; die Fenster „Vorperiode“ und „aktuell“ zeigen, was der Trend-Score vergleicht. */
export function TrendChart({ series, metricLabel, recentWeeks, previousWeeks }: TrendChartProps) {
  const chartConfig = { value: { label: metricLabel, color: "var(--series-trend)" } } satisfies ChartConfig;
  const recentStart = series[series.length - recentWeeks]?.weekStart;
  const previousStart = series[series.length - recentWeeks - previousWeeks]?.weekStart;
  const previousEnd = series[series.length - recentWeeks - 1]?.weekStart;
  const last = series[series.length - 1]?.weekStart;

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full" role="img" aria-label={`${metricLabel} der letzten ${series.length} Wochen`}>
      <AreaChart data={series} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="2 4" strokeOpacity={0.5} />
        {previousStart && previousEnd ? (
          <ReferenceArea x1={previousStart} x2={previousEnd} fill="var(--foreground)" fillOpacity={0.05} label={{ value: "Vorperiode", position: "insideTop", fill: "var(--muted-foreground)", fontSize: 10 }} />
        ) : null}
        {recentStart && last ? (
          <ReferenceArea x1={recentStart} x2={last} fill="var(--series-trend)" fillOpacity={0.14} label={{ value: "aktuell", position: "insideTop", fill: "var(--muted-foreground)", fontSize: 10 }} />
        ) : null}
        <XAxis dataKey="weekStart" tickLine={false} axisLine={false} tickMargin={8} minTickGap={48} tickFormatter={formatWeek} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={<ChartTooltipContent labelFormatter={(value) => `Woche ab ${formatWeek(String(value))}`} indicator="line" />}
        />
        <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} fill="url(#trendFill)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive />
      </AreaChart>
    </ChartContainer>
  );
}
