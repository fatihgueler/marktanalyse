/**
 * `npm run collect` – ein kompletter Lauf des Trend-Radars:
 * Nachfrage → Angebot → Referenzpreis → Matching → Scoring → Snapshot in PostgreSQL.
 *
 * Ohne API-Keys läuft alles im Mock-Modus. Sobald eine Quelle live wäre (echter Key gesetzt),
 * bricht das Skript ohne `--live` ab, damit nie versehentlich kostenpflichtige Aufrufe passieren.
 * Railway Cron: `npm run collect -- --live`.
 */
import { config as loadDotenv } from "dotenv";
import { configVersion, validateConfig } from "@/config/config-check";
import { COUNTRIES, radarConfig, type Country } from "@/config/radar.config";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { mapWithConcurrency } from "@/lib/concurrency";
import { getDb } from "@/lib/db";
import { readCollectEnv } from "@/lib/env";
import { round } from "@/lib/stats";
import { createJudge, matchProducts, type JudgmentCache } from "@/matching/match";
import type { Judgment, MatchJudge } from "@/matching/types";
import { combineAdSignals } from "@/scoring/ads";
import { scoreCompetition } from "@/scoring/competition";
import { calculateMargin, fallbackReferencePrice } from "@/scoring/margin";
import { totalScore, type CandidateBreakdown } from "@/scoring/score";
import { scoreTrend, type TrendBreakdown } from "@/scoring/trend";
import { metaTokenDaysLeft } from "@/sources/ads/meta-ad-library";
import { createSources, describeModes, type SourceSet } from "@/sources/registry";
import type { AdRecord, DemandRecord, PriceRecord, SupplyRecord, SupplySource, TrendSource } from "@/sources/types";

loadDotenv({ quiet: true });

interface RunError {
  /** Warnungen (z. B. Token läuft bald ab) machen einen Lauf nicht PARTIAL */
  level?: "fehler" | "warnung";
  source: string;
  country?: Country;
  keyword?: string;
  message: string;
}

interface RunContext {
  db: PrismaClient;
  runId: string;
  sources: SourceSet;
  judge: MatchJudge;
  errors: RunError[];
  stats: { keywords: number; qualified: number; offers: number; candidates: number };
}

const asJson = (value: unknown) => value as Prisma.InputJsonValue;
/** Ab so vielen Resttagen warnt der Lauf, dass der Meta-Token erneuert werden muss */
const META_TOKEN_WARN_DAYS = 10;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

// ── Kostenschutz ─────────────────────────────────────────────────────────

function estimateLiveRequests(modes: Record<string, string>): string[] {
  const { maxSeedsPerCountry, maxKeywordsPerCountry } = radarConfig.demand;
  const countries = COUNTRIES.length;
  const lines: string[] = [];
  if (modes["google-trends"] === "live") {
    lines.push(`SerpApi Google Trends: bis zu ${countries * (maxSeedsPerCountry + maxKeywordsPerCountry)} Suchen`);
  }
  if (modes["google-shopping"] === "live") {
    lines.push(`SerpApi Google Shopping: bis zu ${countries * maxKeywordsPerCountry} Suchen`);
  }
  if (modes.aliexpress === "live") {
    lines.push(`AliExpress Affiliate API: bis zu ${countries * maxKeywordsPerCountry} Anfragen`);
  }
  const adCountries = radarConfig.ads.coveredCountries.length;
  if (modes["meta-ad-library"] === "live") {
    const pages = Math.ceil(radarConfig.ads.maxAdsPerKeyword.meta / 50);
    lines.push(`Meta Ad Library: bis zu ${adCountries * maxKeywordsPerCountry * pages} Anfragen (kostenlos, aber Rate-Limit)`);
  }
  if (modes["tiktok-ads"] === "live") {
    const pages = Math.ceil(radarConfig.ads.maxAdsPerKeyword.tiktok / 10);
    lines.push(`TikTok Ad Library: bis zu ${adCountries * maxKeywordsPerCountry * pages} Anfragen (Tageskontingent)`);
  }
  if (modes.claude === "live") {
    lines.push(`Claude (${process.env.ANTHROPIC_MODEL ?? "Standardmodell"}): bis zu ${countries * maxKeywordsPerCountry} Requests (abzüglich Cache)`);
  }
  return lines;
}

// ── Match-Cache über Prisma ─────────────────────────────────────────────

function createJudgmentCache(db: PrismaClient, productIds: Map<string, string>): JudgmentCache {
  return {
    async load(keyword, externalIds, judgeId) {
      const internalIds = externalIds.map((id) => productIds.get(id)).filter((id): id is string => Boolean(id));
      const rows = await db.matchJudgment.findMany({
        where: { keyword, judge: judgeId, productId: { in: internalIds } },
        include: { product: { select: { externalId: true } } },
      });
      return new Map(
        rows.map((row) => [
          row.product.externalId,
          {
            externalId: row.product.externalId,
            relevance: row.relevance,
            category: row.category as Judgment["category"],
            reason: row.reason,
          },
        ]),
      );
    },
    async save(keyword, judgeId, judgments) {
      for (const j of judgments) {
        const productId = productIds.get(j.externalId);
        if (!productId) continue;
        await db.matchJudgment.upsert({
          where: { keyword_productId_judge: { keyword, productId, judge: judgeId } },
          create: { keyword, productId, judge: judgeId, relevance: j.relevance, category: j.category, reason: j.reason },
          update: { relevance: j.relevance, category: j.category, reason: j.reason },
        });
      }
    },
  };
}

// ── Nachfrage ────────────────────────────────────────────────────────────

interface ScoredDemand {
  record: DemandRecord;
  signalId: string;
  trend: TrendBreakdown;
}

async function collectDemand(ctx: RunContext, source: TrendSource, country: Country): Promise<ScoredDemand[]> {
  const seeds = radarConfig.demand.seeds[country].slice(0, radarConfig.demand.maxSeedsPerCountry);
  let discovered;
  try {
    discovered = await source.discoverKeywords(seeds, country);
  } catch (error) {
    ctx.errors.push({ source: source.id, country, message: `Keyword-Entdeckung: ${errorMessage(error)}` });
    return [];
  }
  const keywords = discovered.slice(0, radarConfig.demand.maxKeywordsPerCountry);
  ctx.stats.keywords += keywords.length;

  const results = await mapWithConcurrency(keywords, radarConfig.collect.concurrency, async ({ keyword, seedTerm }) => {
    try {
      const record = await source.fetchSeries(keyword, seedTerm, country);
      if (!record) return null;
      const trend = scoreTrend(record.series.map((p) => p.value));
      const signal = await ctx.db.demandSignal.create({
        data: {
          runId: ctx.runId,
          source: record.source,
          country,
          keyword: record.keyword,
          seedTerm: record.seedTerm,
          series: asJson(record.series),
          fetchedAt: record.fetchedAt,
          raw: asJson(record.raw),
        },
      });
      return { record, signalId: signal.id, trend };
    } catch (error) {
      ctx.errors.push({ source: source.id, country, keyword, message: errorMessage(error) });
      return null;
    }
  });
  return results.filter((r): r is ScoredDemand => r !== null);
}

// ── Angebot, Referenzpreis, Matching, Scoring je Keyword ────────────────

async function storeOffers(ctx: RunContext, offers: SupplyRecord[], country: Country) {
  const stored: { offer: SupplyRecord; productId: string; offerId: string }[] = [];
  for (const offer of offers) {
    const product = await ctx.db.supplyProduct.upsert({
      where: { source_externalId: { source: offer.source, externalId: offer.externalId } },
      create: { source: offer.source, externalId: offer.externalId, title: offer.title, url: offer.url, imageUrl: offer.imageUrl },
      update: { title: offer.title, url: offer.url, imageUrl: offer.imageUrl },
    });
    const row = await ctx.db.supplyOffer.create({
      data: {
        runId: ctx.runId,
        productId: product.id,
        keyword: offer.keyword,
        shipTo: country,
        price: round(offer.price),
        currency: offer.currency,
        shippingCost: offer.shippingCost === null ? null : round(offer.shippingCost),
        orders30d: offer.orders30d,
        rating: offer.rating,
        resultCount: offer.resultCount,
        fetchedAt: offer.fetchedAt,
        raw: asJson(offer.raw),
      },
    });
    stored.push({ offer, productId: product.id, offerId: row.id });
  }
  return stored;
}

async function fetchReferencePrice(ctx: RunContext, keyword: string, country: Country): Promise<PriceRecord | null> {
  const source = ctx.sources.price;
  try {
    const record = await source.referencePrice(keyword, country);
    if (!record) return null;
    await ctx.db.referencePrice.create({
      data: {
        runId: ctx.runId,
        source: record.source,
        country,
        keyword,
        medianPrice: record.medianPrice,
        currency: record.currency,
        sampleSize: record.sampleSize,
        fetchedAt: record.fetchedAt,
        raw: asJson(record.raw),
      },
    });
    return record;
  } catch (error) {
    ctx.errors.push({ source: source.id, country, keyword, message: errorMessage(error) });
    return null;
  }
}

async function fetchAdSignals(ctx: RunContext, keyword: string, country: Country): Promise<AdRecord[]> {
  const results = await Promise.all(
    ctx.sources.ads.map(async (source) => {
      try {
        const record = await source.adActivity(keyword, country);
        await ctx.db.adSignal.create({
          data: {
            runId: ctx.runId,
            source: record.source,
            country,
            keyword,
            coverage: record.coverage,
            activeAds: record.activeAds,
            advertisers: record.advertisers,
            capped: record.capped,
            newAdsPerWeek: asJson(record.newAdsPerWeek),
            firstSeen: record.firstSeen,
            samples: asJson(record.samples),
            fetchedAt: record.fetchedAt,
            raw: asJson(record.raw),
          },
        });
        return record;
      } catch (error) {
        ctx.errors.push({ source: source.id, country, keyword, message: errorMessage(error) });
        return null;
      }
    }),
  );
  return results.filter((r): r is AdRecord => r !== null);
}

async function processKeyword(ctx: RunContext, supply: SupplySource, demand: ScoredDemand, country: Country): Promise<void> {
  const keyword = demand.record.keyword;
  let offers: SupplyRecord[];
  try {
    offers = await supply.search(keyword, country, radarConfig.supply.resultsPerKeyword);
  } catch (error) {
    ctx.errors.push({ source: supply.id, country, keyword, message: errorMessage(error) });
    return;
  }
  if (offers.length === 0) return;
  ctx.stats.offers += offers.length;

  const stored = await storeOffers(ctx, offers, country);
  const [reference, adRecords] = await Promise.all([fetchReferencePrice(ctx, keyword, country), fetchAdSignals(ctx, keyword, country)]);
  const ads = combineAdSignals(adRecords);

  const productIds = new Map(stored.map((s) => [s.offer.externalId, s.productId]));
  const match = await matchProducts(
    {
      keyword,
      country,
      products: offers.map((o) => ({ externalId: o.externalId, title: o.title, price: o.price, currency: o.currency })),
    },
    ctx.judge,
    createJudgmentCache(ctx.db, productIds),
  );
  if (match.error) ctx.errors.push({ source: "claude", country, keyword, message: match.error });

  // Wettbewerb gilt für das Keyword als Ganzes: Anbieterzahl + Bestellvolumen aller Top-Treffer.
  const orders = offers.map((o) => o.orders30d).filter((o): o is number => o !== null);
  const competition = scoreCompetition({
    resultCount: offers[0]?.resultCount ?? null,
    orders30dSum: orders.length > 0 ? orders.reduce((a, b) => a + b, 0) : null,
    advertisers: ads.advertisers,
  });

  for (const { offer, productId, offerId } of stored) {
    const judgment = match.judgments.get(offer.externalId);
    if (!judgment || judgment.relevance < radarConfig.matching.minRelevance) continue;

    const currency = radarConfig.countries[country].currency;
    const referencePrice = reference?.medianPrice ?? fallbackReferencePrice(offer.price, offer.currency, country, judgment.category);
    const referenceCurrency = reference?.currency ?? currency;
    const referenceSource = reference ? reference.source : "config-multiplikator";

    const margin = calculateMargin({
      country,
      category: judgment.category,
      purchasePrice: offer.price,
      purchaseCurrency: offer.currency,
      shippingCost: offer.shippingCost,
      shippingCurrency: offer.currency,
      referencePrice,
      referenceCurrency,
    });
    const score = totalScore({ trend: demand.trend, margin, competition, relevance: judgment.relevance });
    const breakdown: CandidateBreakdown = {
      trend: demand.trend,
      margin,
      competition,
      score,
      referencePrice: {
        source: referenceSource,
        sampleSize: reference?.sampleSize ?? null,
        originalPrice: referencePrice,
        originalCurrency: referenceCurrency,
      },
      ads,
    };

    await ctx.db.candidateSnapshot.create({
      data: {
        runId: ctx.runId,
        productId,
        demandSignalId: demand.signalId,
        supplyOfferId: offerId,
        country,
        keyword,
        category: judgment.category,
        relevance: judgment.relevance,
        matchReason: judgment.reason,
        matchJudge: judgment.judge,
        trendScore: demand.trend.score,
        marginScore: margin.score,
        competitionScore: competition.score,
        totalScore: score.total,
        landedCost: round(margin.landedCost),
        referencePrice: round(margin.referencePrice),
        referencePriceSource: referenceSource,
        marginAbs: round(margin.marginAbs),
        marginPct: margin.marginPct,
        belowMinMargin: margin.belowMinMargin,
        currency: margin.currency,
        breakdown: asJson(breakdown),
      },
    });
    ctx.stats.candidates++;
  }
}

async function collectCountry(ctx: RunContext, country: Country): Promise<void> {
  for (const trendSource of ctx.sources.trend) {
    const demand = await collectDemand(ctx, trendSource, country);
    // Vorfilter spart Angebots-, Preis- und Claude-Aufrufe für Keywords ohne Dynamik.
    const qualified = demand.filter((d) => d.trend.score >= radarConfig.supply.minTrendScoreForSupply);
    ctx.stats.qualified += qualified.length;
    for (const supply of ctx.sources.supply) {
      await mapWithConcurrency(qualified, radarConfig.collect.concurrency, (d) => processKeyword(ctx, supply, d, country));
    }
  }
}

// ── Hauptablauf ──────────────────────────────────────────────────────────

async function printTopCandidates(db: PrismaClient, runId: string): Promise<void> {
  const top = await db.candidateSnapshot.findMany({
    where: { runId, belowMinMargin: false },
    orderBy: { totalScore: "desc" },
    take: 10,
    include: { product: { select: { title: true } } },
  });
  if (top.length === 0) return;
  console.log("\nTop 10 Kandidaten:");
  for (const [i, c] of top.entries()) {
    const title = c.product.title.length > 48 ? `${c.product.title.slice(0, 47)}…` : c.product.title;
    console.log(
      `${String(i + 1).padStart(2)}. ${c.totalScore.toFixed(1).padStart(5)}  ${c.country}  ${title.padEnd(48)}  Marge ${Number(c.marginAbs).toFixed(2)} ${c.currency} (${(c.marginPct * 100).toFixed(0)} %)`,
    );
  }
}

async function main(): Promise<number> {
  const liveFlag = process.argv.includes("--live");
  validateConfig();
  const env = readCollectEnv();
  const sources = createSources(env);
  const judge = createJudge(env);
  const modes = describeModes(sources, judge.mode);

  console.log("Trend-Radar – Lauf startet");
  for (const [source, mode] of Object.entries(modes)) {
    console.log(`  ${source.padEnd(16)} ${mode === "live" ? "LIVE" : "Mock (kein Key)"}`);
  }

  const liveCosts = estimateLiveRequests(modes);
  if (liveCosts.length > 0) {
    console.log("\nKostenpflichtige Aufrufe in diesem Lauf (Obergrenze laut Config):");
    for (const line of liveCosts) console.log(`  • ${line}`);
    if (!liveFlag) {
      console.error("\nAbbruch: Mindestens eine Quelle läuft live. Zum Bestätigen mit `npm run collect -- --live` starten.");
      return 2;
    }
  }

  const warnings: RunError[] = [];
  if (modes["meta-ad-library"] === "live" && env.META_ACCESS_TOKEN && env.META_APP_ID && env.META_APP_SECRET) {
    try {
      const daysLeft = await metaTokenDaysLeft(env.META_ACCESS_TOKEN, env.META_APP_ID, env.META_APP_SECRET);
      if (daysLeft !== null && daysLeft < META_TOKEN_WARN_DAYS) {
        warnings.push({ level: "warnung", source: "meta-ad-library", message: `Meta-Token läuft in ${daysLeft} Tagen ab – bitte erneuern.` });
      }
    } catch (error) {
      warnings.push({ level: "warnung", source: "meta-ad-library", message: `Token-Prüfung fehlgeschlagen: ${errorMessage(error)}` });
    }
  }

  const db = getDb();
  const run = await db.run.create({ data: { sourceModes: modes, configVersion: configVersion() } });
  const ctx: RunContext = {
    db,
    runId: run.id,
    sources,
    judge,
    errors: [...warnings],
    stats: { keywords: 0, qualified: 0, offers: 0, candidates: 0 },
  };

  let status: "SUCCEEDED" | "PARTIAL" | "FAILED" = "SUCCEEDED";
  try {
    for (const country of COUNTRIES) {
      await collectCountry(ctx, country);
      console.log(`  ${country}: fertig`);
    }
    const realErrors = ctx.errors.filter((e) => e.level !== "warnung");
    if (realErrors.length > 0) status = ctx.stats.candidates > 0 ? "PARTIAL" : "FAILED";
  } catch (error) {
    status = "FAILED";
    ctx.errors.push({ source: "collect", message: errorMessage(error) });
  }

  await db.run.update({
    where: { id: run.id },
    data: { status, finishedAt: new Date(), errors: ctx.errors.length > 0 ? asJson(ctx.errors) : undefined },
  });

  const { keywords, qualified, offers, candidates } = ctx.stats;
  console.log(`\nLauf ${run.id}: ${status}`);
  console.log(`  ${keywords} Keywords, ${qualified} mit Trend-Dynamik, ${offers} Angebote, ${candidates} Kandidaten`);
  if (ctx.errors.length > 0) {
    console.log(`  ${ctx.errors.length} Meldungen:`);
    for (const e of ctx.errors.slice(0, 10)) {
      console.log(`    - ${e.level === "warnung" ? "Warnung " : ""}[${e.source}${e.country ? `/${e.country}` : ""}${e.keyword ? ` „${e.keyword}“` : ""}] ${e.message}`);
    }
  }
  await printTopCandidates(db, run.id);
  await db.$disconnect();
  return status === "FAILED" ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("Collect-Lauf abgebrochen:", errorMessage(error));
    process.exit(1);
  });
