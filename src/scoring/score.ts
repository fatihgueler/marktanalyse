import { radarConfig, type RadarConfig } from "@/config/radar.config";
import { clamp } from "@/lib/stats";
import type { CompetitionBreakdown } from "./competition";
import type { MarginBreakdown } from "./margin";
import type { TrendBreakdown } from "./trend";

export interface ScoreInput {
  trend: TrendBreakdown;
  margin: MarginBreakdown;
  competition: CompetitionBreakdown;
  /** Match-Relevanz 0..1 aus Claude oder Heuristik */
  relevance: number;
}

export interface ScoreBreakdown {
  weights: RadarConfig["score"]["weights"];
  /** gewichtete Beiträge (Summe = Basis-Score 0..1) */
  contributions: { trend: number; margin: number; competition: number };
  baseScore: number;
  relevance: number;
  relevanceFactor: number;
  /** 0..100 */
  total: number;
}

/**
 * Gesamtscore 0..100. Die Relevanz wirkt als Faktor: Ein perfekter Trend mit einem
 * unpassenden Produkt soll nicht oben stehen.
 */
export function totalScore(input: ScoreInput, config: RadarConfig["score"] = radarConfig.score): ScoreBreakdown {
  const { weights } = config;
  const contributions = {
    trend: weights.trend * input.trend.score,
    margin: weights.margin * input.margin.score,
    competition: weights.competition * input.competition.score,
  };
  const baseScore = contributions.trend + contributions.margin + contributions.competition;
  const relevance = clamp(input.relevance, 0, 1);
  const relevanceFactor = relevance ** config.relevanceExponent;
  const total = clamp(100 * relevanceFactor * baseScore, 0, 100);
  return { weights, contributions, baseScore, relevance, relevanceFactor, total };
}

/** Alles, was die Detailansicht für die Aufschlüsselung braucht – wird als JSON gespeichert. */
export interface CandidateBreakdown {
  trend: TrendBreakdown;
  margin: MarginBreakdown;
  competition: CompetitionBreakdown;
  score: ScoreBreakdown;
  referencePrice: { source: string; sampleSize: number | null; originalPrice: number; originalCurrency: string };
}
