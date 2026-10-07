import type { SortKey } from "./queries";

export interface GroupableRow {
  id: string;
  productId: string;
  keyword: string;
  country: string;
  totalScore: number;
  marginPct: number;
  trendScore: number;
  belowMinMargin: boolean;
}

export interface CandidateGroup<T extends GroupableRow> {
  /** bester Kandidat der Gruppe – liefert Bild, Name, Urteil und Link */
  best: T;
  rows: T[];
  /** bester Score je Land, gerundet, absteigend */
  countries: { country: string; score: number }[];
  /** verschiedene Lieferanten-Angebote in der Gruppe */
  offerCount: number;
}

/** Bevorzugt Kandidaten über der Mindestmarge, dann den höheren Gesamtscore. */
function better<T extends GroupableRow>(a: T, b: T): T {
  if (a.belowMinMargin !== b.belowMinMargin) return a.belowMinMargin ? b : a;
  return b.totalScore > a.totalScore ? b : a;
}

const SORT_VALUE: Record<SortKey, (row: GroupableRow) => number> = {
  score: (r) => r.totalScore,
  marge: (r) => r.marginPct,
  trend: (r) => r.trendScore,
};

/**
 * Ein Produkt = eine Karte. Zusammengeführt wird, was dasselbe Keyword hat (gleiche Idee in DE, AT …,
 * mehrere Varianten) oder dasselbe Lieferanten-Angebot (z. B. „wolkenlampe“ und „cloud lamp“ finden
 * denselben Artikel). Verbunden über Union-Find, damit auch Ketten zusammenkommen.
 */
export function groupCandidates<T extends GroupableRow>(rows: readonly T[], sort: SortKey): CandidateGroup<T>[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(x, root);
    return root;
  };
  const union = (a: string, b: string) => {
    for (const k of [a, b]) if (!parent.has(k)) parent.set(k, k);
    parent.set(find(a), find(b));
  };
  for (const row of rows) union(`k:${row.keyword.trim().toLowerCase()}`, `p:${row.productId}`);

  const byRoot = new Map<string, T[]>();
  for (const row of rows) {
    const root = find(`p:${row.productId}`);
    byRoot.set(root, [...(byRoot.get(root) ?? []), row]);
  }

  const groups = [...byRoot.values()].map((members): CandidateGroup<T> => {
    const best = members.reduce(better);
    const perCountry = new Map<string, number>();
    for (const m of members) perCountry.set(m.country, Math.max(perCountry.get(m.country) ?? 0, m.totalScore));
    const countries = [...perCountry.entries()]
      .map(([country, score]) => ({ country, score: Math.round(score) }))
      .sort((a, b) => b.score - a.score || a.country.localeCompare(b.country));
    return { best, rows: members, countries, offerCount: new Set(members.map((m) => m.productId)).size };
  });

  const value = SORT_VALUE[sort];
  return groups.sort((a, b) => {
    if (a.best.belowMinMargin !== b.best.belowMinMargin) return a.best.belowMinMargin ? 1 : -1;
    return Math.max(...b.rows.map(value)) - Math.max(...a.rows.map(value));
  });
}
