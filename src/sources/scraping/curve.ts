import { addWeeks, isoDate, mondayOf } from "@/lib/weeks";
import type { TrendPoint } from "../types";

export interface CurvePoint {
  /** Unix-Sekunden */
  timestamp: number;
  value: number;
}

/**
 * Wandelt eine tägliche Popularitätskurve (0–100) in Wochenwerte um: Mittelwert je Woche,
 * laufende Woche verworfen (unvollständig), neu normiert auf Maximum = 100 wie bei Google Trends.
 */
export function curveToWeeklySeries(points: readonly CurvePoint[], now: Date = new Date()): TrendPoint[] {
  const currentWeek = mondayOf(now).getTime();
  const buckets = new Map<number, number[]>();
  for (const point of points) {
    const week = mondayOf(new Date(point.timestamp * 1000)).getTime();
    if (week >= currentWeek || !Number.isFinite(point.value)) continue;
    buckets.set(week, [...(buckets.get(week) ?? []), point.value]);
  }
  const weeks = [...buckets.entries()].sort(([a], [b]) => a - b);
  const means = weeks.map(([week, values]) => ({ week, value: values.reduce((a, b) => a + b, 0) / values.length }));
  const max = Math.max(1, ...means.map((m) => m.value));
  return means.map((m) => ({ weekStart: isoDate(new Date(m.week)), value: Math.round((m.value / max) * 100) }));
}

/** Umkehrung für Demo-Daten: Wochenreihe → tägliche Kurve (7 Punkte je Woche, leichte Streuung). */
export function weeklyToDailyCurve(series: readonly TrendPoint[], rng: () => number): CurvePoint[] {
  return series.flatMap((point) => {
    const start = new Date(`${point.weekStart}T00:00:00Z`);
    return Array.from({ length: 7 }, (_, day) => ({
      timestamp: Math.floor(addWeeks(start, day / 7).getTime() / 1000),
      value: Math.max(0, Math.round(point.value * (0.92 + rng() * 0.16))),
    }));
  });
}
