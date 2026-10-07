"use client";

import { Area, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatWeek } from "@/lib/format";
import type { BacktestResult } from "@/scoring/backtest";

const chartConfig = {
  value: { label: "Suchinteresse", color: "var(--series-trend)" },
  signal: { label: "Signal", color: "var(--status-good)" },
} satisfies ChartConfig;

interface BacktestChartProps {
  result: BacktestResult;
  label: string;
  /** Linien für erstes Signal und Höhepunkt – bei Kontrollen ohne echten Höhepunkt aus */
  markers?: boolean;
}

/** Ganzer Zeitraum der CSV; grüne Punkte = Wochen, in denen der Radar angeschlagen hätte. */
export function BacktestChart({ result, label, markers = true }: BacktestChartProps) {
  const data = result.weeks.map((w) => ({ weekStart: w.weekStart, value: w.value, signal: w.signal ? w.value : null }));
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-36 w-full" role="img" aria-label={`Suchinteresse „${label}“ mit Signalwochen`}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <XAxis dataKey="weekStart" tickLine={false} axisLine={false} tickMargin={6} minTickGap={56} tickFormatter={formatWeek} />
        <YAxis domain={[0, 100]} hide />
        {markers && result.firstSignal ? <ReferenceLine x={result.firstSignal.weekStart} stroke="var(--status-good)" strokeDasharray="3 3" /> : null}
        {markers ? <ReferenceLine x={result.peak.weekStart} stroke="var(--subtle-foreground)" strokeOpacity={0.6} strokeDasharray="3 3" /> : null}
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => `Woche ab ${formatWeek(String(value))}`} indicator="line" />} />
        <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={1.5} fill="var(--color-value)" fillOpacity={0.12} isAnimationActive={false} />
        <Line dataKey="signal" stroke="none" dot={{ r: 2.5, fill: "var(--color-signal)", strokeWidth: 0 }} activeDot={false} isAnimationActive={false} legendType="none" />
      </ComposedChart>
    </ChartContainer>
  );
}
