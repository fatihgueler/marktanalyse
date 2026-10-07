"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
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

/**
 * Wochenverlauf als durchgehende Linie bis zum letzten Datenpunkt.
 * „Vorperiode“ und „aktuell“ – die Fenster, die der Trend-Score vergleicht – sind nur dezente Linien am Fensterbeginn,
 * erklärt in der Legende darunter, damit nichts die Kurve verdeckt. Ohne Einblend-Animation: halb gezeichnete Kurven
 * sahen auf Screenshots kaputt aus.
 */
export function TrendChart({ series, metricLabel, recentWeeks, previousWeeks }: TrendChartProps) {
  const chartConfig = { value: { label: metricLabel, color: "var(--series-trend)" } } satisfies ChartConfig;
  const recentStart = series[series.length - recentWeeks]?.weekStart;
  const previousStart = series[series.length - recentWeeks - previousWeeks]?.weekStart;

  return (
    <figure className="grid gap-2">
      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full" role="img" aria-label={`${metricLabel} der letzten ${series.length} Wochen`}>
        <AreaChart data={series} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="2 4" strokeOpacity={0.5} />
          {previousStart ? <ReferenceLine x={previousStart} stroke="var(--subtle-foreground)" strokeOpacity={0.5} strokeDasharray="3 3" /> : null}
          {recentStart ? <ReferenceLine x={recentStart} stroke="var(--series-trend)" strokeOpacity={0.45} strokeDasharray="3 3" /> : null}
          <XAxis dataKey="weekStart" tickLine={false} axisLine={false} tickMargin={8} minTickGap={48} tickFormatter={formatWeek} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} width={32} />
          <ChartTooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={<ChartTooltipContent labelFormatter={(value) => `Woche ab ${formatWeek(String(value))}`} indicator="line" />}
          />
          <Area
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            fill="url(#trendFill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            connectNulls
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 border-l border-dashed border-subtle-foreground" aria-hidden="true" />
          ab hier Vorperiode ({previousWeeks} Wochen)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 border-l border-dashed border-series-trend" aria-hidden="true" />
          ab hier aktuell ({recentWeeks} Wochen) – diese beiden Zeiträume vergleicht der Trend
        </span>
      </figcaption>
    </figure>
  );
}
