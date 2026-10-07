"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = { score: { label: "Score", color: "var(--series-trend)" } } satisfies ChartConfig;

export interface HistoryPoint {
  label: string;
  score: number;
}

/** Score dieses Kandidaten über alle Läufe – zeigt, ob ein Trend Fahrt aufnimmt oder abflaut. Ohne Animation und Lücken. */
export function ScoreHistoryChart({ points }: { points: HistoryPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-40 w-full" role="img" aria-label="Score-Verlauf über alle Läufe">
      <LineChart data={points} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 4" strokeOpacity={0.5} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <Line dataKey="score" type="monotone" stroke="var(--color-score)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: "var(--color-score)" }} connectNulls isAnimationActive={false} />
      </LineChart>
    </ChartContainer>
  );
}
