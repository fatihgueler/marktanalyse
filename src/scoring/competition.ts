import { radarConfig, type RadarConfig } from "@/config/radar.config";
import { clamp } from "@/lib/stats";

/** ANNAHME: Fehlt eine Angabe, gilt sie als mittlere Sättigung – weder Bonus noch Strafe. */
const UNKNOWN_SATURATION = 0.5;

export interface CompetitionInput {
  /** Gesamttreffer der Lieferanten-Suche (Anbieter-Proxy) */
  resultCount: number | null;
  /** Summe der Bestellungen/30 Tage der Top-Treffer (Nachfrage-Sättigung) */
  orders30dSum: number | null;
}

export interface CompetitionBreakdown extends CompetitionInput {
  resultsSaturation: number;
  ordersSaturation: number;
  saturation: number;
  weights: RadarConfig["competition"]["weights"];
  /** 0..1, 1 = wenig Wettbewerb */
  score: number;
}

function logSaturation(value: number | null, logCap: number): number {
  if (value === null || !Number.isFinite(value) || value < 0) return UNKNOWN_SATURATION;
  return clamp(Math.log10(1 + value) / logCap, 0, 1);
}

/**
 * Wettbewerbs-Proxy (Phase 1): Viele Anbieter und viele Bestellungen auf AliExpress bedeuten,
 * dass das Produkt breit verfügbar ist – im Westen ist dann meist schon Konkurrenz aktiv.
 */
export function scoreCompetition(
  input: CompetitionInput,
  config: RadarConfig["competition"] = radarConfig.competition,
): CompetitionBreakdown {
  const resultsSaturation = logSaturation(input.resultCount, config.resultCountLogCap);
  const ordersSaturation = logSaturation(input.orders30dSum, config.ordersLogCap);
  const saturation = clamp(config.weights.results * resultsSaturation + config.weights.orders * ordersSaturation, 0, 1);
  return { ...input, resultsSaturation, ordersSaturation, saturation, weights: config.weights, score: 1 - saturation };
}
