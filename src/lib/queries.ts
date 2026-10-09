// Nur aus Server Components aufrufen (nutzt Prisma).
import { CATEGORY_IDS, COUNTRIES, radarConfig, type CategoryId, type Country } from "@/config/radar.config";
import type { Prisma } from "@/generated/prisma/client";
import type { CalibrationRow } from "@/scoring/calibration";
import type { CandidateBreakdown } from "@/scoring/score";
import { isLiveOperation } from "@/sources/readiness";
import type { TrendPoint } from "@/sources/types";
import type { CheckView } from "@/app/check/actions";
import { getDb } from "./db";

export type SortKey = "score" | "marge" | "trend";
export const SORT_KEYS: readonly SortKey[] = ["score", "marge", "trend"];

export interface CandidateFilters {
  country: Country | null;
  category: CategoryId | null;
  sort: SortKey;
  /** nur „Neu diese Woche“ (neue und deutlich gestiegene Produkte) */
  onlyNew: boolean;
  /** Saisonware (z. B. Halloween, Weihnachten) ausblenden */
  hideSeasonal: boolean;
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
    onlyNew: pick("neu") === "1",
    hideSeasonal: pick("saison") === "0",
  };
}

/**
 * Lauf, den das Dashboard zeigt: der letzte abgeschlossene Lauf mit echten Quellen, sonst der letzte Demo-Lauf.
 * Ein neuerer Demo-Lauf (z. B. lokal oder beim ersten Start) soll echte Ergebnisse nicht verdrängen.
 */
export async function getLatestRun() {
  const runs = await getDb().run.findMany({
    where: { status: { in: ["SUCCEEDED", "PARTIAL"] }, finishedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { _count: { select: { candidates: true, demandSignals: true } } },
  });
  return runs.find((run) => isLiveOperation(run.sourceModes as Record<string, string>)) ?? runs[0] ?? null;
}

/**
 * Quellen, deren Angebote in einem echten Lauf nicht gezeigt werden: Sie liefen im Demo-Modus und erfinden
 * Produkte (Links führen ins Leere). Ältere Läufe mischten Demo-Angebote noch unter echte Trends.
 * Reine Demo-Läufe zeigen alles – dort ist alles erkennbar Demo.
 */
export function hiddenDemoSources(sourceModes: unknown): string[] {
  const modes = sourceModes as Record<string, string>;
  if (!isLiveOperation(modes)) return [];
  return Object.entries(modes)
    .filter(([, mode]) => mode === "mock")
    .map(([id]) => id);
}

/**
 * Vergleichslauf für „Neu diese Woche“: der letzte abgeschlossene Lauf, der mindestens
 * `ranking.compareMinDaysBack` Tage vor `run` begann und von derselben Art ist (echt bzw. Demo).
 * Sonst stünde beim ersten echten Lauf alles als „neu“ da.
 */
export async function getComparisonRun(run: { startedAt: Date; sourceModes: unknown }) {
  const cutoff = new Date(run.startedAt.getTime() - radarConfig.ranking.compareMinDaysBack * 24 * 60 * 60 * 1000);
  const live = isLiveOperation(run.sourceModes as Record<string, string>);
  const earlier = await getDb().run.findMany({
    where: { status: { in: ["SUCCEEDED", "PARTIAL"] }, finishedAt: { not: null }, startedAt: { lte: cutoff } },
    orderBy: { startedAt: "desc" },
    take: 20,
    select: { id: true, startedAt: true, sourceModes: true, configVersion: true },
  });
  return earlier.find((r) => isLiveOperation(r.sourceModes as Record<string, string>) === live) ?? null;
}

/** Kandidaten eines früheren Laufs für den Vergleich – nur Land, Produkt, Keyword und Score. */
export async function getPreviousCandidates(runId: string, country: Country | null, hiddenSources: readonly string[] = []) {
  return getDb().candidateSnapshot.findMany({
    where: { runId, ...(country ? { country } : {}), ...(hiddenSources.length > 0 ? { product: { source: { notIn: [...hiddenSources] } } } : {}) },
    select: { productId: true, keyword: true, country: true, totalScore: true },
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

export async function getCandidates(runId: string, filters: CandidateFilters, hiddenSources: readonly string[] = []) {
  const rows = await getDb().candidateSnapshot.findMany({
    where: {
      runId,
      ...(hiddenSources.length > 0 ? { product: { source: { notIn: [...hiddenSources] } } } : {}),
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
export async function getCategoryCounts(runId: string, country: Country | null, hiddenSources: readonly string[] = []): Promise<Map<string, number>> {
  const groups = await getDb().candidateSnapshot.groupBy({
    by: ["category"],
    where: { runId, ...(country ? { country } : {}), ...(hiddenSources.length > 0 ? { product: { source: { notIn: [...hiddenSources] } } } : {}) },
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
      // Ältere Läufe hatten je Keyword zwei Preisquellen – gezeigt wird die, die genutzt wurde.
      where: { runId: candidate.runId, country: candidate.country, keyword: candidate.keyword, source: candidate.referencePriceSource },
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
      product: { select: { title: true, source: true, externalId: true } },
      candidateSnapshot: { select: { id: true, trendScore: true, marginScore: true, competitionScore: true, totalScore: true, breakdown: true } },
    },
  });
  // Drops aus der Merkliste: Scores aus dem Produkt-Check (SupplyProduct „manuell“, externalId = ProductCheck.id)
  const manualIds = outcomes.filter((o) => !o.candidateSnapshot && o.product.source === "manuell").map((o) => o.product.externalId);
  const checks = new Map(
    (await getDb().productCheck.findMany({ where: { id: { in: manualIds } }, select: { id: true, trendScore: true, marginScore: true } })).map((c) => [c.id, c]),
  );
  return outcomes.map((o) => {
    const breakdown = o.candidateSnapshot?.breakdown as unknown as CandidateBreakdown | undefined;
    const check = o.product.source === "manuell" ? checks.get(o.product.externalId) : undefined;
    const manualRow: CalibrationRow | null = check
      ? { verdict: o.verdict, trend: check.trendScore, margin: check.marginScore, competition: null, total: null, adMomentum: null }
      : null;
    const row: CalibrationRow | null = manualRow ?? (o.candidateSnapshot
      ? {
          verdict: o.verdict,
          trend: o.candidateSnapshot.trendScore,
          margin: o.candidateSnapshot.marginScore,
          competition: o.candidateSnapshot.competitionScore,
          total: o.candidateSnapshot.totalScore,
          adMomentum: breakdown?.ads?.covered ? breakdown.ads.momentum.growth : null,
        }
      : null);
    return { ...o, row, checkId: check?.id ?? null };
  });
}

/** Gespeicherter Pinterest-Zugang aus „Mit Pinterest verbinden“ bzw. der letzten Erneuerung. */
export async function getPinterestConnection() {
  return getDb().apiToken.findUnique({ where: { provider: "pinterest" }, select: { expiresAt: true, updatedAt: true } });
}

/** Merkliste (Produkt-Check), neueste zuerst; optional nach Land und Kategorie gefiltert. */
export async function getProductChecks(filters: { country?: Country | null; category?: CategoryId | null } = {}) {
  const rows = await getDb().productCheck.findMany({
    where: {
      ...(filters.country ? { country: filters.country } : {}),
      ...(filters.category ? { category: filters.category } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toCheckRow);
}

export async function getProductCheck(id: string) {
  const db = getDb();
  const check = await db.productCheck.findUnique({ where: { id } });
  if (!check) return null;
  const drops = await db.dropOutcome.findMany({
    where: { product: { source: "manuell", externalId: id } },
    orderBy: [{ droppedAt: "desc" }, { createdAt: "desc" }],
  });
  return { ...toCheckRow(check), drops };
}

function toCheckRow(check: Awaited<ReturnType<ReturnType<typeof getDb>["productCheck"]["findFirstOrThrow"]>>) {
  return {
    ...check,
    country: check.country as Country,
    view: check.result as unknown as CheckView,
    trendSeries: (check.trendSeries ?? null) as unknown as TrendPoint[] | null,
    marginAbs: Number(check.marginAbs),
    purchasePrice: Number(check.purchasePrice),
  };
}

export type CheckRow = ReturnType<typeof toCheckRow>;
