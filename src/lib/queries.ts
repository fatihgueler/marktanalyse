// Nur aus Server Components aufrufen (nutzt Prisma).
import { CATEGORY_IDS, COUNTRIES, type CategoryId, type Country } from "@/config/radar.config";
import type { Prisma } from "@/generated/prisma/client";
import type { CalibrationRow } from "@/scoring/calibration";
import type { CandidateBreakdown } from "@/scoring/score";
import type { TrendPoint } from "@/sources/types";
import { getDb } from "./db";

export type SortKey = "score" | "marge" | "trend";
export const SORT_KEYS: readonly SortKey[] = ["score", "marge", "trend"];

export interface CandidateFilters {
  country: Country | null;
  category: CategoryId | null;
  sort: SortKey;
}

/** URL-Parameter defensiv lesen – ungültige Werte werden ignoriert statt Fehler zu werfen. */
export function parseFilters(params: Record<string, string | string[] | undefined>): CandidateFilters {
  const pick = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);
  const land = pick("land")?.toUpperCase();
  const kategorie = pick("kategorie");
  const sort = pick("sort");
  return {
    country: COUNTRIES.includes(land as Country) ? (land as Country) : null,
    category: CATEGORY_IDS.includes(kategorie as CategoryId) ? (kategorie as CategoryId) : null,
    sort: SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : "score",
  };
}

/** Letzter abgeschlossener Lauf mit Ergebnissen. */
export async function getLatestRun() {
  return getDb().run.findFirst({
    where: { status: { in: ["SUCCEEDED", "PARTIAL"] }, finishedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    include: { _count: { select: { candidates: true, demandSignals: true } } },
  });
}

export async function getRunCount(): Promise<number> {
  return getDb().run.count();
}

const ORDER_BY: Record<SortKey, Prisma.CandidateSnapshotOrderByWithRelationInput> = {
  score: { totalScore: "desc" },
  marge: { marginPct: "desc" },
  trend: { trendScore: "desc" },
};

const CANDIDATE_LIMIT = 200;

export async function getCandidates(runId: string, filters: CandidateFilters) {
  const rows = await getDb().candidateSnapshot.findMany({
    where: {
      runId,
      ...(filters.country ? { country: filters.country } : {}),
      ...(filters.category ? { category: filters.category } : {}),
    },
    // Kandidaten unter der Mindestmarge immer nach unten, danach gewählte Sortierung.
    orderBy: [{ belowMinMargin: "asc" }, ORDER_BY[filters.sort], { totalScore: "desc" }],
    // Dasselbe Produkt kann über mehrere Keywords kommen (z. B. „wolkenlampe“ via Google, „cloud lamp“
    // via TikTok) – pro Produkt und Land nur der bestplatzierte Eintrag.
    distinct: ["productId", "country"],
    take: CANDIDATE_LIMIT,
    include: {
      product: { select: { title: true, url: true, imageUrl: true, source: true } },
      demandSignal: { select: { series: true, source: true } },
    },
  });
  return rows.map((row) => ({
    ...row,
    series: row.demandSignal.series as unknown as TrendPoint[],
    breakdown: row.breakdown as unknown as CandidateBreakdown,
    marginAbs: Number(row.marginAbs),
    landedCost: Number(row.landedCost),
    referencePrice: Number(row.referencePrice),
  }));
}

export type CandidateRow = Awaited<ReturnType<typeof getCandidates>>[number];

/** Kategorien mit Anzahl im Lauf (für den Filter), respektiert den Länderfilter. */
export async function getCategoryCounts(runId: string, country: Country | null): Promise<Map<string, number>> {
  const groups = await getDb().candidateSnapshot.groupBy({
    by: ["category"],
    where: { runId, ...(country ? { country } : {}) },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.category, g._count._all]));
}

export async function getCandidateDetail(id: string) {
  const db = getDb();
  const candidate = await db.candidateSnapshot.findUnique({
    where: { id },
    include: { product: true, demandSignal: true, supplyOffer: true, run: true },
  });
  if (!candidate) return null;

  const [history, referencePrice] = await Promise.all([
    db.candidateSnapshot.findMany({
      where: { productId: candidate.productId, country: candidate.country, keyword: candidate.keyword },
      orderBy: { run: { startedAt: "asc" } },
      select: { id: true, totalScore: true, trendScore: true, marginScore: true, competitionScore: true, run: { select: { startedAt: true } } },
    }),
    db.referencePrice.findFirst({
      where: { runId: candidate.runId, country: candidate.country, keyword: candidate.keyword },
      select: { fetchedAt: true, source: true, sampleSize: true },
    }),
  ]);

  return {
    ...candidate,
    series: candidate.demandSignal.series as unknown as TrendPoint[],
    breakdown: candidate.breakdown as unknown as CandidateBreakdown,
    sourceModes: candidate.run.sourceModes as Record<string, string>,
    history: history.map((h) => ({ ...h, startedAt: h.run.startedAt })),
    referencePriceMeta: referencePrice,
  };
}

export type CandidateDetail = NonNullable<Awaited<ReturnType<typeof getCandidateDetail>>>;

export async function getDropOutcomes(productId: string, country: Country, keyword: string) {
  return getDb().dropOutcome.findMany({
    where: { productId, country, keyword },
    // Bei gleichem Drop-Datum der zuletzt erfasste Eintrag zuerst – eindeutige Reihenfolge.
    orderBy: [{ droppedAt: "desc" }, { createdAt: "desc" }],
  });
}

/** Alle erfassten Drops mit den Scores des Snapshots, auf dessen Basis entschieden wurde. */
export async function getCalibrationData() {
  const outcomes = await getDb().dropOutcome.findMany({
    orderBy: [{ droppedAt: "desc" }, { createdAt: "desc" }],
    include: {
      product: { select: { title: true } },
      candidateSnapshot: { select: { id: true, trendScore: true, marginScore: true, competitionScore: true, totalScore: true, breakdown: true } },
    },
  });
  return outcomes.map((o) => {
    const breakdown = o.candidateSnapshot?.breakdown as unknown as CandidateBreakdown | undefined;
    const row: CalibrationRow | null = o.candidateSnapshot
      ? {
          verdict: o.verdict,
          trend: o.candidateSnapshot.trendScore,
          margin: o.candidateSnapshot.marginScore,
          competition: o.candidateSnapshot.competitionScore,
          total: o.candidateSnapshot.totalScore,
          adMomentum: breakdown?.ads?.covered ? breakdown.ads.momentum.growth : null,
        }
      : null;
    return { ...o, row };
  });
}
