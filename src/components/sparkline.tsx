import { radarConfig } from "@/config/radar.config";
import type { TrendPoint } from "@/sources/types";

const WIDTH = 132;
const HEIGHT = 34;
const PAD = 3;

/**
 * Kleine 52-Wochen-Kurve für die Tabelle. Die beiden Vergleichsfenster (Vorperiode, aktuell)
 * sind hinterlegt – genau diese Wochen vergleicht der Trend-Score.
 */
export function Sparkline({ series, label }: { series: TrendPoint[]; label: string }) {
  if (series.length < 2) return <span className="text-xs text-subtle-foreground">keine Daten</span>;
  const { recentWeeks, previousWeeks } = radarConfig.trend;
  const step = (WIDTH - PAD * 2) / (series.length - 1);
  const x = (i: number) => PAD + i * step;
  const y = (v: number) => HEIGHT - PAD - (v / 100) * (HEIGHT - PAD * 2);
  const points = series.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const recentStart = x(series.length - recentWeeks) - step / 2;
  const previousStart = x(series.length - recentWeeks - previousWeeks) - step / 2;
  const last = series[series.length - 1];

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img" aria-label={label} className="overflow-visible">
      <rect x={previousStart} y={0} width={recentStart - previousStart} height={HEIGHT} className="fill-foreground/[0.04]" />
      <rect x={recentStart} y={0} width={WIDTH - recentStart} height={HEIGHT} className="fill-series-trend/15" />
      <polyline points={points} fill="none" className="stroke-series-trend" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {last ? <circle cx={x(series.length - 1)} cy={y(last.value)} r={2.75} className="fill-series-trend stroke-card" strokeWidth={1.5} /> : null}
    </svg>
  );
}
