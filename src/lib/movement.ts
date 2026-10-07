import { radarConfig, type RadarConfig } from "@/config/radar.config";

/** Kandidat eines früheren Laufs – nur, was für den Vergleich nötig ist. */
export interface PreviousCandidate {
  productId: string;
  keyword: string;
  country: string;
  totalScore: number;
}

export type Movement = { kind: "neu" } | { kind: "gestiegen"; delta: number } | null;

/** Bester früherer Score je Land und Produkt bzw. Land und Keyword. */
export interface PreviousIndex {
  scores: Map<string, number>;
}

const productKey = (country: string, productId: string) => `${country}|p:${productId}`;
const keywordKey = (country: string, keyword: string) => `${country}|k:${keyword.trim().toLowerCase()}`;

export function indexPrevious(rows: readonly PreviousCandidate[]): PreviousIndex {
  const scores = new Map<string, number>();
  const keep = (key: string, score: number) => scores.set(key, Math.max(scores.get(key) ?? -Infinity, score));
  for (const row of rows) {
    keep(productKey(row.country, row.productId), row.totalScore);
    keep(keywordKey(row.country, row.keyword), row.totalScore);
  }
  return { scores };
}

/**
 * Was hat sich gegenüber dem Vergleichslauf bewegt? Eine Produktgruppe ist „neu“, wenn im selben Land
 * weder dasselbe Angebot noch dasselbe Keyword vorkam. „Gestiegen“ heißt: bester Score jetzt mindestens
 * `risingMinPoints` über dem besten Score damals.
 */
export function groupMovement(
  rows: readonly PreviousCandidate[],
  previous: PreviousIndex,
  config: RadarConfig = radarConfig,
): Movement {
  let before = -Infinity;
  for (const row of rows) {
    before = Math.max(
      before,
      previous.scores.get(productKey(row.country, row.productId)) ?? -Infinity,
      previous.scores.get(keywordKey(row.country, row.keyword)) ?? -Infinity,
    );
  }
  if (before === -Infinity) return { kind: "neu" };
  const delta = Math.round(Math.max(...rows.map((r) => r.totalScore)) - before);
  return delta >= config.ranking.risingMinPoints ? { kind: "gestiegen", delta } : null;
}
