import { radarConfig, type RadarConfig } from "@/config/radar.config";
import { clamp } from "@/lib/stats";

/** ANNAHME: Fehlt eine Angabe, gilt sie als mittlere Sättigung – weder Bonus noch Strafe. */
const UNKNOWN_SATURATION = 0.5;

export interface CompetitionInput {
  /** Gesamttreffer der Lieferanten-Suche (Anbieter-Proxy) */
  resultCount: number | null;
  /** Summe der Bestellungen/30 Tage der Top-Treffer (Nachfrage-Sättigung) */
  orders30dSum: number | null;
  /** Werbetreibende laut Werbebibliotheken; null = Land nicht abgedeckt (CH, GB) */
  advertisers: number | null;
  /** Neuware-Angebote auf dem eBay-Marktplatz des Ziellandes; null = keine Daten */
  marketplaceListings: number | null;
}

export interface CompetitionBreakdown extends CompetitionInput {
  resultsSaturation: number;
  ordersSaturation: number;
  /** Werbedruck 0..1 */
  advertisersSaturation: number;
  /** Angebotsdichte im Zielland 0..1 */
  marketplaceSaturation: number;
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
 * Wettbewerb aus vier Signalen: Anbieterzahl und Bestellvolumen auf AliExpress (breite Verfügbarkeit),
 * Angebote auf eBay im Zielland und Werbedruck – wie viele Shops das Produkt dort bereits bewerben.
 */
export function scoreCompetition(
  input: CompetitionInput,
  config: RadarConfig["competition"] = radarConfig.competition,
): CompetitionBreakdown {
  const resultsSaturation = logSaturation(input.resultCount, config.resultCountLogCap);
  const ordersSaturation = logSaturation(input.orders30dSum, config.ordersLogCap);
  const advertisersSaturation = logSaturation(input.advertisers, config.advertisersLogCap);
  const marketplaceSaturation = logSaturation(input.marketplaceListings, config.marketplaceLogCap);
  const { weights } = config;
  const saturation = clamp(
    weights.results * resultsSaturation +
      weights.orders * ordersSaturation +
      weights.marketplace * marketplaceSaturation +
      weights.advertisers * advertisersSaturation,
    0,
    1,
  );
  return { ...input, resultsSaturation, ordersSaturation, advertisersSaturation, marketplaceSaturation, saturation, weights, score: 1 - saturation };
}
