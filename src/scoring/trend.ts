import { radarConfig, type RadarConfig } from "@/config/radar.config";
import { clamp, mean } from "@/lib/stats";

export interface TrendBreakdown {
  /** Ø der letzten `recentWeeks` Wochen */
  recent: number;
  /** Ø der `previousWeeks` Wochen davor */
  previous: number;
  /** Ø aller älteren Wochen */
  baseline: number;
  /** relatives Wachstum (recent − previous) / max(previous, growthFloor) */
  growth: number;
  /** Wachstums-Komponente 0..1 */
  growthComponent: number;
  /** Frühphasen-Komponente 0..1 (1 = kaum Vorgeschichte), 0 wenn das Interesse nicht steigt */
  earlyComponent: number;
  /** Niveau-Komponente 0..1 */
  levelComponent: number;
  weights: RadarConfig["trend"]["weights"];
  /** Trend-Score 0..1 */
  score: number;
  /** gesetzt, wenn das Signal als Rauschen verworfen wurde */
  rejectedReason: string | null;
  /** Steigt nur, weil gerade wieder Saison ist (siehe `trend.seasonality`); fehlt bei älteren Snapshots */
  seasonal?: boolean;
}

const ROLLING_WEEKS = 4;

/**
 * Saisonware erkennen: steigt jetzt, war im gleichen Zeitraum des Vorjahres (Fensteranfang) ähnlich hoch,
 * und dazwischen lag ein deutliches Tief. Nur bei steigendem Interesse und ausreichend langer Reihe.
 */
export function isSeasonal(values: readonly number[], growth: number, config: RadarConfig["trend"] = radarConfig.trend): boolean {
  const { windowWeeks, minSeriesWeeks, yearAgoMinRatio, troughMaxRatio } = config.seasonality;
  if (growth <= 0 || values.length < minSeriesWeeks) return false;
  const recent = mean(values.slice(-config.recentWeeks));
  const yearAgo = mean(values.slice(0, windowWeeks));
  const middle = values.slice(windowWeeks, -(config.recentWeeks + config.previousWeeks));
  if (middle.length < ROLLING_WEEKS) return false;
  let trough = Infinity;
  for (let i = 0; i + ROLLING_WEEKS <= middle.length; i++) trough = Math.min(trough, mean(middle.slice(i, i + ROLLING_WEEKS)));
  const peak = Math.max(...values);
  return yearAgo >= yearAgoMinRatio * recent && peak > 0 && trough <= troughMaxRatio * peak;
}

/**
 * Trend-Dynamik eines Keywords aus seiner Wochenreihe (älteste zuerst, Werte 0..100).
 *
 * Frühphase schlägt Niveau: Ein Keyword, das von fast null anzieht, bekommt einen hohen Score;
 * eines, das seit Monaten auf hohem Niveau steht („schon auf Bestsellerlisten“), einen niedrigen.
 * Verglichen wird jedes Keyword nur mit sich selbst, da Trends-Werte je Abfrage normiert sind.
 */
export function scoreTrend(values: readonly number[], config: RadarConfig["trend"] = radarConfig.trend): TrendBreakdown {
  const { recentWeeks, previousWeeks, minSeriesWeeks, weights } = config;
  if (values.length < minSeriesWeeks) {
    throw new Error(`Zeitreihe zu kurz: ${values.length} Wochen, mindestens ${minSeriesWeeks} nötig.`);
  }

  const recentValues = values.slice(-recentWeeks);
  const previousValues = values.slice(-(recentWeeks + previousWeeks), -recentWeeks);
  const baselineValues = values.slice(0, -(recentWeeks + previousWeeks));

  const recent = mean(recentValues);
  const previous = mean(previousValues);
  const baseline = mean(baselineValues);

  const growth = (recent - previous) / Math.max(previous, config.growthFloor);
  // Sättigende Funktion: Verdopplung ≈ 0,5, Verzehnfachung ≈ 0,9 – Ausreißer dominieren nicht.
  const growthComponent = growth <= 0 ? 0 : growth / (growth + config.growthHalfSaturation);
  // Frühphase zählt nur bei steigendem Interesse – ein bereits abflauendes Strohfeuer hat zwar
  // wenig Vorgeschichte, ist für einen Drop aber schon zu spät.
  const earlyComponent = growth > 0 ? 1 - clamp(baseline / config.earlyBaselineCap, 0, 1) : 0;
  const levelComponent = clamp(recent / 100, 0, 1);

  let rejectedReason: string | null = null;
  if (recent < config.minRecentInterest) {
    rejectedReason = `Suchinteresse der letzten ${recentWeeks} Wochen zu gering (Ø ${recent.toFixed(1)} < ${config.minRecentInterest})`;
  } else if (config.requireContinuousRecentInterest && recentValues.some((v) => v === 0)) {
    rejectedReason = `Lückenhaftes Suchvolumen: Nullwerte in den letzten ${recentWeeks} Wochen`;
  }

  const score =
    rejectedReason === null
      ? clamp(weights.growth * growthComponent + weights.early * earlyComponent + weights.level * levelComponent, 0, 1)
      : 0;

  const seasonal = rejectedReason === null && isSeasonal(values, growth, config);
  return { recent, previous, baseline, growth, growthComponent, earlyComponent, levelComponent, weights, score, rejectedReason, seasonal };
}
