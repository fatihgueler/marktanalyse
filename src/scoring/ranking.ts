import { radarConfig, type RadarConfig } from "@/config/radar.config";
import type { CompetitionBreakdown } from "./competition";
import { trendPhase, type TrendPhase } from "./product-check";
import type { DeliveryEstimate } from "@/sources/types";
import type { TrendBreakdown } from "./trend";

export type RankingVerdict = "Jetzt testen" | "Beobachten" | "Zu spät" | "Marge zu dünn";
export type CompetitionLevel = "niedrig" | "mittel" | "hoch";

export interface RankingInput {
  trend: TrendBreakdown;
  competition: CompetitionBreakdown;
  /** Gesamtscore 0..100 */
  total: number;
  belowMinMargin: boolean;
}

/** Urteil statt Kommazahl – Reihenfolge und Schwellen siehe `ranking` in der Config. */
export function rankingVerdict(input: RankingInput, config: RadarConfig = radarConfig): RankingVerdict {
  const r = config.ranking;
  if (input.belowMinMargin) return "Marge zu dünn";
  if (input.trend.rejectedReason) return "Beobachten";
  if (input.trend.growth <= 0 || input.competition.score < r.competitionHighBelow) return "Zu spät";
  return input.total >= r.testNowMinScore ? "Jetzt testen" : "Beobachten";
}

export function competitionLevel(competition: CompetitionBreakdown, config: RadarConfig = radarConfig): CompetitionLevel {
  if (competition.score < config.ranking.competitionHighBelow) return "hoch";
  return competition.score >= config.ranking.competitionLowMin ? "niedrig" : "mittel";
}

/** Wachstum in Worten statt Prozent – „+1.085 %“ bei winziger Ausgangsbasis sagt niemandem etwas. */
export function growthWords(trend: TrendBreakdown, config: RadarConfig = radarConfig): string {
  if (trend.rejectedReason) return "Signal zu schwach";
  if (trend.growth <= 0) return trend.growth < 0 ? "fallend" : "gleichbleibend";
  if (trend.growth >= config.ranking.growthStrongMin) return "stark steigend";
  return trend.growth >= config.ranking.growthMin ? "steigend" : "leicht steigend";
}

/** „Frühphase · stark steigend“ – Phase und Wachstum, beides aus der bestehenden Trend-Bewertung. */
export function trendWords(trend: TrendBreakdown, config: RadarConfig = radarConfig): { phase: TrendPhase; growth: string } {
  return { phase: trendPhase(trend, config), growth: growthWords(trend, config) };
}

/** Trend in Worten: „Frühphase · stark steigend“, bei schwachem Signal nur der Hinweis. */
export function trendSummary(trend: TrendBreakdown, config: RadarConfig = radarConfig): string {
  const { phase, growth } = trendWords(trend, config);
  if (phase === "Rauschen") return "Signal zu schwach";
  if (phase === "Kein Anstieg") return growth;
  return `${phase} · ${growth}`;
}

/** Ein Satz, warum das Urteil so ausfällt – dieselben Regeln wie `rankingVerdict`, nur in Worten. */
export function rankingReason(input: RankingInput, config: RadarConfig = radarConfig): string {
  const verdict = rankingVerdict(input, config);
  switch (verdict) {
    case "Marge zu dünn":
      return "Nach Versand, Zoll, Steuern und Gebühren bleibt pro Stück weniger als die Mindestmarge.";
    case "Zu spät":
      return input.trend.growth <= 0 ? "Die Nachfrage steigt nicht mehr – der Zug ist vermutlich abgefahren." : "Es verkaufen schon viele Anbieter – schwer, noch Fuß zu fassen.";
    case "Jetzt testen":
      return "Steigende Nachfrage, genug Marge und überschaubare Konkurrenz – ein kleiner Test-Drop lohnt sich.";
    case "Beobachten":
      return input.trend.rejectedReason
        ? "Das Nachfragesignal ist noch zu schwach für ein Urteil – im Blick behalten."
        : "Interessant, aber noch nicht eindeutig genug für einen Test – nächsten Lauf abwarten.";
  }
}

/** „7–12 Tage“, „9 Tage“; null ohne Angabe der Quelle. */
export function deliveryWords(delivery: DeliveryEstimate | null | undefined): string | null {
  if (!delivery) return null;
  const { minDays, maxDays } = delivery;
  if (minDays === null && maxDays === null) return null;
  if (minDays === null || maxDays === null || minDays === maxDays) return `${maxDays ?? minDays} Tage`;
  return `${minDays}–${maxDays} Tage`;
}

/** Länger als `shipping.maxDeliveryDays` (Höchstwert laut Quelle) – für einen Drop zu langsam. */
export function isSlowDelivery(delivery: DeliveryEstimate | null | undefined, config: RadarConfig = radarConfig): boolean {
  const days = delivery?.maxDays ?? delivery?.minDays ?? null;
  return days !== null && days > config.shipping.maxDeliveryDays;
}
