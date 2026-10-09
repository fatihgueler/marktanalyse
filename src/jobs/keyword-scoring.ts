/**
 * Bewertung aller Angebote zu einem Keyword in einem Land – gemeinsam für `collect` (neue Daten)
 * und `rescore` (gespeicherte Daten): Matching → Lizenzfilter → Übersetzung → Referenzpreis passend
 * zum Produkt → Plausibilität → Marge → Score → CandidateSnapshot.
 */
import { radarConfig, type Country, type RadarConfig } from "@/config/radar.config";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { round } from "@/lib/stats";
import { matchProducts, type JudgmentCache } from "@/matching/match";
import type { OfferTitleTranslator, TranslatedOffer } from "@/matching/title-translator";
import type { Judgment, MatchJudge } from "@/matching/types";
import type { combineAdSignals } from "@/scoring/ads";
import { scoreCompetition } from "@/scoring/competition";
import { licenseHit } from "@/scoring/keyword-filter";
import { calculateMargin, calculateWholesaleMargin, fallbackReferencePrice } from "@/scoring/margin";
import { implausiblePurchase } from "@/scoring/plausibility";
import { totalScore, type CandidateBreakdown } from "@/scoring/score";
import type { TrendBreakdown } from "@/scoring/trend";
import type { FxInfo } from "@/sources/fx/ecb";
import type { PriceRecord, SupplyRecord } from "@/sources/types";
import type { RunMessage } from "./run-report";

export interface StoredOffer {
  offer: SupplyRecord;
  productId: string;
  offerId: string;
}

/** Aussortierte Angebote fürs Log */
export interface DroppedOffers {
  license: { country: Country; keyword: string; title: string; hit: string }[];
  implausible: { country: Country; keyword: string; title: string; purchaseEur: number; referenceEur: number }[];
}

export interface ScoringEnv {
  db: PrismaClient;
  runId: string;
  /** Config mit den Wechselkursen dieses Laufs */
  config: RadarConfig;
  fx: FxInfo;
  judge: MatchJudge;
  translator: OfferTitleTranslator;
  errors: RunMessage[];
  stats: { candidates: number };
  dropped: DroppedOffers;
}

export interface KeywordInput {
  keyword: string;
  country: Country;
  trend: TrendBreakdown;
  demandSignalId: string;
  /** Angebote je Quelle (Wettbewerb wird je Quelle berechnet) */
  groups: StoredOffer[][];
  ads: ReturnType<typeof combineAdSignals>;
  /**
   * Referenzpreis holen – mit dem Produkt-Suchbegriff des besten Angebots (oder dem Keyword).
   * null = für dieses Keyword keine Preisabfrage (Kostenbremse) → Kategorie-Faktor.
   */
  reference: ((query: string) => Promise<PriceRecord | null>) | null;
}

const asJson = (value: unknown) => value as Prisma.InputJsonValue;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createJudgmentCache(db: PrismaClient, productIds: Map<string, string>): JudgmentCache {
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
          { externalId: row.product.externalId, relevance: row.relevance, category: row.category as Judgment["category"], reason: row.reason },
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

interface Relevant {
  stored: StoredOffer;
  judgment: Judgment & { judge: string };
  group: number;
}

export async function scoreKeyword(env: ScoringEnv, input: KeywordInput): Promise<void> {
  const { keyword, country } = input;

  // 1. Matching je Quelle, dann Lizenzware raus (Originaltitel, chinesisch oder lateinisch)
  const relevant: Relevant[] = [];
  for (const [group, stored] of input.groups.entries()) {
    const productIds = new Map(stored.map((s) => [s.offer.externalId, s.productId]));
    const match = await matchProducts(
      { keyword, country, products: stored.map((s) => ({ externalId: s.offer.externalId, title: s.offer.title, price: s.offer.price, currency: s.offer.currency })) },
      env.judge,
      createJudgmentCache(env.db, productIds),
    );
    if (match.error) env.errors.push({ source: "claude", country, keyword, message: match.error });
    for (const s of stored) {
      const judgment = match.judgments.get(s.offer.externalId);
      if (!judgment || judgment.relevance < radarConfig.matching.minRelevance) continue;
      const hit = licenseHit(s.offer.title);
      if (hit) {
        env.dropped.license.push({ country, keyword, title: s.offer.title, hit });
        continue;
      }
      relevant.push({ stored: s, judgment, group });
    }
  }
  if (relevant.length === 0) return;

  // 2. Titel übersetzen und Produkt-Suchbegriffe bilden (ein Aufruf für alle relevanten Angebote)
  let translations = new Map<string, TranslatedOffer>();
  try {
    translations = await env.translator.translate(
      relevant.map((r) => ({ externalId: r.stored.offer.externalId, title: r.stored.offer.title })),
      keyword,
      country,
    );
  } catch (error) {
    env.errors.push({ level: "warnung", source: "claude", country, keyword, message: `Titel-Übersetzung fehlgeschlagen, Shopping sucht mit dem Keyword: ${errorMessage(error)}` });
  }
  const kept = relevant.filter((r) => {
    const titleDe = translations.get(r.stored.offer.externalId)?.titleDe;
    const hit = titleDe ? licenseHit(titleDe) : null;
    if (hit) env.dropped.license.push({ country, keyword, title: titleDe!, hit });
    return !hit;
  });
  if (kept.length === 0) return;

  // 3. Referenzpreis mit dem Produkt-Suchbegriff des passendsten Angebots (bei Gleichstand: meistverkauft)
  const best = [...kept].sort(
    (a, b) => b.judgment.relevance - a.judgment.relevance || (b.stored.offer.orders30d ?? 0) - (a.stored.offer.orders30d ?? 0),
  )[0]!;
  const query = translations.get(best.stored.offer.externalId)?.productQuery || keyword;
  const reference = input.reference ? await input.reference(query) : null;

  // 4. Wettbewerb je Quelle: Anbieterzahl + Bestellvolumen aller Top-Treffer + Werbedruck
  const competitionByGroup = input.groups.map((stored) => {
    const orders = stored.map((s) => s.offer.orders30d).filter((o): o is number => o !== null);
    return scoreCompetition(
      {
        resultCount: stored[0]?.offer.resultCount ?? null,
        orders30dSum: orders.length > 0 ? orders.reduce((a, b) => a + b, 0) : null,
        advertisers: input.ads.advertisers,
      },
      env.config.competition,
    );
  });

  // 5. Marge, Plausibilität, Score
  for (const { stored, judgment, group } of kept) {
    const { offer, productId, offerId } = stored;
    const currency = env.config.countries[country].currency;
    // ANNAHME: Beim Großhandelspreis fällt die Faktor-Schätzung konservativ (niedriger) aus.
    const referencePrice = reference?.medianPrice ?? fallbackReferencePrice(offer.price, offer.currency, country, judgment.category, env.config);
    const referenceCurrency = reference?.currency ?? currency;
    const referenceSource = reference ? reference.source : "config-multiplikator";

    if (reference && offer.sourcingModel === "wholesale") {
      const implausible = implausiblePurchase(
        { price: offer.price, currency: offer.currency, priceTiers: offer.priceTiers ?? [], moq: offer.moq ?? null, referencePrice, referenceCurrency },
        env.config,
      );
      if (implausible) {
        env.dropped.implausible.push({ country, keyword, title: translations.get(offer.externalId)?.titleDe ?? offer.title, ...implausible });
        continue;
      }
    }

    const margin =
      offer.sourcingModel === "wholesale"
        ? calculateWholesaleMargin(
            {
              country,
              category: judgment.category,
              basePrice: offer.price,
              priceTiers: offer.priceTiers ?? [],
              purchaseCurrency: offer.currency,
              moq: offer.moq ?? null,
              weightKg: offer.weightKg ?? null,
              referencePrice,
              referenceCurrency,
            },
            env.config,
          )
        : calculateMargin(
            {
              country,
              category: judgment.category,
              purchasePrice: offer.price,
              purchaseCurrency: offer.currency,
              shippingCost: offer.shippingCost,
              shippingCurrency: offer.currency,
              referencePrice,
              referenceCurrency,
            },
            env.config,
          );
    const competition = competitionByGroup[group]!;
    const score = totalScore({ trend: input.trend, margin, competition, relevance: judgment.relevance });
    const translation = translations.get(offer.externalId);
    const breakdown: CandidateBreakdown = {
      trend: input.trend,
      margin,
      competition,
      score,
      referencePrice: {
        source: referenceSource,
        sampleSize: reference?.sampleSize ?? null,
        originalPrice: referencePrice,
        originalCurrency: referenceCurrency,
      },
      ads: input.ads,
      delivery: offer.delivery ?? undefined,
      fx: { source: env.fx.source, date: env.fx.date },
      offer: { titleDe: translation?.titleDe ?? null, productQuery: reference ? query : (translation?.productQuery ?? null) },
    };

    await env.db.candidateSnapshot.create({
      data: {
        runId: env.runId,
        productId,
        demandSignalId: input.demandSignalId,
        supplyOfferId: offerId,
        country,
        keyword,
        category: judgment.category,
        relevance: judgment.relevance,
        matchReason: judgment.reason,
        matchJudge: judgment.judge,
        trendScore: input.trend.score,
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
    env.stats.candidates++;
  }
}

/** Log: aussortierte Angebote (Lizenzware, unplausible Preise) mit Anzahl und Beispielen. */
export function printDroppedOffers(dropped: DroppedOffers, examples = radarConfig.keywordFilter.logExamples): void {
  console.log(`\nAussortierte Angebote: ${dropped.license.length} Lizenzware, ${dropped.implausible.length} Einkauf über Verkaufspreis`);
  for (const d of dropped.license.slice(0, examples)) console.log(`  - Lizenzware (${d.hit}) ${d.country} „${d.keyword}“: ${d.title.slice(0, 60)}`);
  for (const d of dropped.implausible.slice(0, examples)) {
    console.log(`  - Unplausibel ${d.country} „${d.keyword}“: ${d.title.slice(0, 50)} – Einkauf ${d.purchaseEur.toFixed(2)} € > Verkauf ${d.referenceEur.toFixed(2)} €`);
  }
}
