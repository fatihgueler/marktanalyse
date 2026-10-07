import { radarConfig, type RadarConfig } from "@/config/radar.config";
import type { TrendPoint } from "@/sources/types";
import { trendPhase, type TrendPhase } from "./product-check";
import { scoreTrend } from "./trend";

export interface BacktestWeek {
  weekStart: string;
  /** Wert aus der CSV (bezogen auf den ganzen Zeitraum) */
  value: number;
  /** Trend-Score, den der Radar in dieser Woche berechnet hätte; null, solange das Fenster noch nicht voll ist */
  trendScore: number | null;
  signal: boolean;
}

export type BacktestStatus = "rechtzeitig" | "knapp" | "verpasst" | "zu wenig Vorlauf";

export interface BacktestResult {
  weeks: BacktestWeek[];
  peak: { index: number; weekStart: string };
  /** erstes Signal im Fenster `leadWindowWeeks` vor dem Höhepunkt */
  firstSignal: { index: number; weekStart: string; trendScore: number; phase: TrendPhase } | null;
  /** Wochen zwischen erstem Signal und Höhepunkt */
  leadWeeks: number | null;
  /** Signale, die mehr als `leadWindowWeeks` vor dem Höhepunkt lagen (Fehlalarme oder eine frühere Welle) */
  earlierSignals: number;
  /** alle Signalwochen – bei Kontrollprodukten (gleichbleibend, saisonal) sollte das 0 bzw. klein sein */
  signalWeeks: number;
  status: BacktestStatus;
}

/**
 * Spielt den Radar über eine lange Wochenreihe nach: Jede Woche wird – wie im Echtbetrieb – nur das
 * zurückliegende Jahr bewertet, neu auf 100 normiert (Google Trends normiert jede Abfrage auf ihr eigenes Maximum).
 * Gemessen wird, wie viele Wochen vor dem Höhepunkt das erste Signal gekommen wäre.
 */
export function runBacktest(series: readonly TrendPoint[], config: RadarConfig = radarConfig): BacktestResult {
  const { windowWeeks, signalMinTrendScore, leadWindowWeeks, goodLeadWeeks } = config.backtest;
  const values = series.map((p) => p.value);
  const phases = new Map<number, TrendPhase>();

  const weeks = series.map((point, index): BacktestWeek => {
    if (index < windowWeeks - 1) return { weekStart: point.weekStart, value: point.value, trendScore: null, signal: false };
    const window = values.slice(index - windowWeeks + 1, index + 1);
    const max = Math.max(...window);
    if (max <= 0) return { weekStart: point.weekStart, value: point.value, trendScore: 0, signal: false };
    const trend = scoreTrend(
      window.map((v) => (v / max) * 100),
      config.trend,
    );
    phases.set(index, trendPhase(trend, config));
    return { weekStart: point.weekStart, value: point.value, trendScore: trend.score, signal: trend.score >= signalMinTrendScore };
  });

  const peakIndex = values.indexOf(Math.max(...values));
  const peak = { index: peakIndex, weekStart: series[peakIndex]!.weekStart };
  const windowStart = peakIndex - leadWindowWeeks;

  let firstSignal: BacktestResult["firstSignal"] = null;
  for (let i = Math.max(0, windowStart); i <= peakIndex; i++) {
    const week = weeks[i]!;
    if (week.signal) {
      firstSignal = { index: i, weekStart: week.weekStart, trendScore: week.trendScore ?? 0, phase: phases.get(i) ?? "Rauschen" };
      break;
    }
  }
  const earlierSignals = weeks.slice(0, Math.max(0, windowStart)).filter((w) => w.signal).length;
  const leadWeeks = firstSignal ? peakIndex - firstSignal.index : null;

  // Für eine faire Aussage muss der Radar das ganze Fenster vor dem Höhepunkt schon bewerten können.
  const enoughHistory = windowStart >= windowWeeks - 1;
  const status: BacktestStatus =
    leadWeeks !== null ? (leadWeeks >= goodLeadWeeks ? "rechtzeitig" : "knapp") : enoughHistory ? "verpasst" : "zu wenig Vorlauf";

  return { weeks, peak, firstSignal, leadWeeks, earlierSignals, signalWeeks: weeks.filter((w) => w.signal).length, status };
}

export interface BacktestSummary {
  total: number;
  inTime: number;
  tight: number;
  missed: number;
  /** ohne Produkte mit zu wenig Vorlauf */
  evaluated: number;
  /** Median der Vorlaufzeit über alle Treffer (rechtzeitig + knapp) */
  medianLeadWeeks: number | null;
  earlierSignals: number;
}

export function summarizeBacktests(results: readonly BacktestResult[]): BacktestSummary {
  const leads = results
    .map((r) => r.leadWeeks)
    .filter((l): l is number => l !== null)
    .sort((a, b) => a - b);
  const mid = Math.floor(leads.length / 2);
  const median = leads.length === 0 ? null : leads.length % 2 === 1 ? leads[mid]! : (leads[mid - 1]! + leads[mid]!) / 2;
  const count = (status: BacktestStatus) => results.filter((r) => r.status === status).length;
  return {
    total: results.length,
    inTime: count("rechtzeitig"),
    tight: count("knapp"),
    missed: count("verpasst"),
    evaluated: results.length - count("zu wenig Vorlauf"),
    medianLeadWeeks: median,
    earlierSignals: results.reduce((sum, r) => sum + r.earlierSignals, 0),
  };
}
