/**
 * `npm run rescore -- --run <id>` – bewertet einen gespeicherten Lauf neu, ohne neue Daten zu holen:
 * Keyword-Filter (Regeln + Claude), Saison-Erkennung, Lizenz- und Plausibilitätsfilter, Titel-Übersetzung
 * und die ehrliche Staffel-Angabe werden auf die Rohdaten angewendet.
 *
 * KEINE SerpApi-Suchen, KEINE Apify-Läufe: Es werden gar keine Datenquellen erzeugt. Kostenpflichtig sind
 * nur Claude-Aufrufe (gebündelt; bereits bewertete Angebote kommen aus dem Cache) – deshalb mit
 * ANTHROPIC_API_KEY nur mit `--live`. Der SerpApi-Kontostand wird vorher und nachher gelesen (kostenlos).
 *
 * Ergebnis: ein NEUER Lauf mit `rescoreOf = <id>`; der Originallauf bleibt unverändert.
 */
import { config as loadDotenv } from "dotenv";
import { configVersion, validateConfig } from "@/config/config-check";
import { radarConfig, type Country } from "@/config/radar.config";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { readCollectEnv } from "@/lib/env";
import { createKeywordClassifier } from "@/matching/keyword-classifier";
import { gateKeywords, type RejectedKeyword } from "@/matching/keyword-gate";
import { createJudge } from "@/matching/match";
import { createTitleTranslator } from "@/matching/title-translator";
import { combineAdSignals } from "@/scoring/ads";
import { scoreTrend, type TrendBreakdown } from "@/scoring/trend";
import { loadFxRates, withFx } from "@/sources/fx/ecb";
import { normalize1688Item } from "@/sources/scraping/alibaba-1688";
import { fetchSerpApiAccount } from "@/sources/serpapi-account";
import type { AdRecord, AdSample, PriceRecord, SupplyRecord } from "@/sources/types";
import { printDroppedOffers, scoreKeyword, type ScoringEnv, type StoredOffer } from "./keyword-scoring";
import { countCards, formatFunnel, printMessages, printTopCandidates, type Funnel, type RunMessage } from "./run-report";

loadDotenv({ quiet: true });

const asJson = (value: unknown) => value as Prisma.InputJsonValue;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function serpApiLeft(apiKey: string | undefined): Promise<number | null> {
  if (!apiKey) return null;
  try {
    return (await fetchSerpApiAccount(apiKey)).left;
  } catch (error) {
    console.warn(`  SerpApi-Kontostand nicht abrufbar: ${errorMessage(error)}`);
    return null;
  }
}

type OfferRow = Prisma.SupplyOfferGetPayload<{ include: { product: true } }>;

/** Zeile für den neuen Lauf kopieren: ohne eigene ID und Lauf-Zuordnung */
function copyFields<T extends { id: string; runId: string }>(row: T): Omit<T, "id" | "runId"> {
  const copy: Partial<T> = { ...row };
  delete copy.id;
  delete copy.runId;
  return copy as Omit<T, "id" | "runId">;
}

/** Gespeichertes Angebot → SupplyRecord; 1688-Rohdaten werden neu gelesen (Staffeln, Mindestmenge, Gewicht). */
function toSupplyRecord(row: OfferRow, country: Country): SupplyRecord {
  if (row.product.source === "alibaba-1688" && row.raw && typeof row.raw === "object") {
    const item = { ...(row.raw as Record<string, unknown>) };
    delete item.searchKeywordZh;
    const record = normalize1688Item(item, row.keyword, country, row.fetchedAt);
    // Staffeln, Mindestmenge und Gewicht aus den Rohdaten; Preis und Kennzahlen wie gespeichert
    if (record) {
      return { ...record, externalId: row.product.externalId, price: Number(row.price), orders30d: row.orders30d, resultCount: row.resultCount, rating: row.rating, raw: row.raw };
    }
  }
  return {
    source: row.product.source,
    country,
    fetchedAt: row.fetchedAt,
    raw: row.raw,
    externalId: row.product.externalId,
    keyword: row.keyword,
    title: row.product.title,
    url: row.product.url,
    imageUrl: row.product.imageUrl,
    price: Number(row.price),
    currency: row.currency,
    shippingCost: row.shippingCost === null ? null : Number(row.shippingCost),
    orders30d: row.orders30d,
    rating: row.rating,
    resultCount: row.resultCount,
    sourcingModel: "direct",
  };
}

async function main(): Promise<number> {
  const runId = argValue("--run");
  if (!runId) {
    console.error("Aufruf: npm run rescore -- --run <Lauf-ID> [--live]");
    return 2;
  }
  validateConfig();
  const env = readCollectEnv();
  const claudeLive = Boolean(env.ANTHROPIC_API_KEY);
  console.log(`Trend-Radar – Nachbewertung von Lauf ${runId}`);
  console.log(`  Claude: ${claudeLive ? `LIVE (${env.ANTHROPIC_MODEL})` : "aus (Heuristik, kein Key)"} · SerpApi und Apify: werden NICHT aufgerufen`);
  if (claudeLive && !process.argv.includes("--live")) {
    console.error(
      "\nAbbruch: Mit ANTHROPIC_API_KEY ruft die Nachbewertung Claude auf (Keyword-Prüfung, Titel-Übersetzung, neue Matches; " +
        "je Land und Keyword ein gebündelter Aufruf, bereits bewertete Angebote aus dem Cache). Zum Bestätigen mit `--live` starten.",
    );
    return 2;
  }

  const db = getDb();
  const source = await db.run.findUnique({ where: { id: runId } });
  if (!source) {
    console.error(`Lauf ${runId} nicht gefunden.`);
    return 2;
  }
  if (source.status !== "SUCCEEDED" && source.status !== "PARTIAL") {
    console.error(`Lauf ${runId} hat Status ${source.status} – nur abgeschlossene Läufe lassen sich nachbewerten.`);
    return 2;
  }

  const leftBefore = await serpApiLeft(env.SERPAPI_API_KEY);
  if (leftBefore !== null) console.log(`  SerpApi-Kontostand vorher: ${leftBefore} Suchen übrig`);

  const [signals, offers, references, adSignals] = await Promise.all([
    db.demandSignal.findMany({ where: { runId }, orderBy: { fetchedAt: "asc" } }),
    db.supplyOffer.findMany({ where: { runId }, include: { product: true } }),
    db.referencePrice.findMany({ where: { runId } }),
    db.adSignal.findMany({ where: { runId } }),
  ]);
  const before = {
    curves: signals.length,
    qualified: new Set(
      signals
        .filter((s) => scoreTrend((s.series as { value: number }[]).map((p) => p.value)).score >= radarConfig.supply.minTrendScoreForSupply)
        .map((s) => `${s.country}|${s.keyword}`),
    ).size,
    offers: offers.length,
    candidates: await db.candidateSnapshot.count({ where: { runId } }),
    cards: await countCards(db, runId),
  };

  const { fx } = await loadFxRates();
  const config = withFx(radarConfig, fx);
  const run = await db.run.create({
    data: { sourceModes: asJson(source.sourceModes), configVersion: configVersion(), rescoreOf: runId },
  });
  const errors: RunMessage[] = [
    { level: "warnung", source: "betrieb", message: `Nachbewertung von Lauf ${runId} – Referenzpreise aus dem Originallauf (allgemeines Keyword, keine neuen Shopping-Suchen).` },
  ];
  const scoring: ScoringEnv = {
    db,
    runId: run.id,
    config,
    fx,
    judge: createJudge(env),
    translator: createTitleTranslator(env),
    errors,
    stats: { candidates: 0 },
    dropped: { license: [], implausible: [] },
  };
  const classifier = createKeywordClassifier(env);
  const rejected: (RejectedKeyword & { country: Country })[] = [];
  const funnel: Funnel = { discovered: signals.length, keywords: 0, qualified: 0, offers: 0, candidates: 0 };

  let status: "SUCCEEDED" | "PARTIAL" | "FAILED" = "SUCCEEDED";
  try {
    const countries = [...new Set(signals.map((s) => s.country as Country))];
    for (const country of countries) {
      const inCountry = signals.filter((s) => s.country === country);
      // 1. Keyword-Filter je Quelle (Claude nur für die Quellen aus config.keywordFilter.claudeCheckSources)
      const kept = new Set<string>();
      for (const sourceId of [...new Set(inCountry.map((s) => s.source))]) {
        const keywords = [...new Set(inCountry.filter((s) => s.source === sourceId).map((s) => s.keyword))];
        const useClaude = radarConfig.keywordFilter.claudeCheckSources.includes(sourceId);
        const gate = await gateKeywords(keywords, country, useClaude ? classifier : null);
        if (gate.claudeError) errors.push({ level: "warnung", source: "claude", country, message: `Keyword-Prüfung fehlgeschlagen: ${gate.claudeError}` });
        gate.kept.forEach((k) => kept.add(`${sourceId}|${k}`));
        rejected.push(...gate.rejected.map((r) => ({ ...r, country })));
      }

      // 2. Trend neu bewerten (mit Saison-Erkennung); je Keyword die stärkste Quelle
      const best = new Map<string, { signal: (typeof signals)[number]; trend: TrendBreakdown }>();
      for (const signal of inCountry.filter((s) => kept.has(`${s.source}|${s.keyword}`))) {
        funnel.keywords++;
        const trend = scoreTrend((signal.series as { value: number }[]).map((p) => p.value));
        const current = best.get(signal.keyword);
        if (!current || trend.score > current.trend.score) best.set(signal.keyword, { signal, trend });
      }
      const qualified = [...best.values()].filter((d) => d.trend.score >= radarConfig.supply.minTrendScoreForSupply);
      funnel.qualified += qualified.length;

      // 3. Je Keyword: Rohdaten in den neuen Lauf kopieren und neu bewerten
      for (const { signal, trend } of qualified) {
        const keywordOffers = offers.filter((o) => o.shipTo === country && o.keyword === signal.keyword);
        if (keywordOffers.length === 0) continue;
        const newSignal = await db.demandSignal.create({ data: { ...copyFields(signal), runId: run.id, series: asJson(signal.series), raw: asJson(signal.raw) } });

        const groups = new Map<string, StoredOffer[]>();
        for (const row of keywordOffers) {
          const offerData: Partial<OfferRow> = copyFields(row);
          delete offerData.product;
          const copy = await db.supplyOffer.create({ data: { ...(offerData as Omit<OfferRow, "id" | "runId" | "product">), runId: run.id, raw: asJson(row.raw) } });
          const sourceId = row.product.source;
          groups.set(sourceId, [...(groups.get(sourceId) ?? []), { offer: toSupplyRecord(row, country), productId: row.productId, offerId: copy.id }]);
          funnel.offers++;
        }

        const ads = adSignals.filter((a) => a.country === country && a.keyword === signal.keyword);
        for (const ad of ads) {
          await db.adSignal.create({ data: { ...copyFields(ad), runId: run.id, newAdsPerWeek: asJson(ad.newAdsPerWeek), samples: asJson(ad.samples), raw: asJson(ad.raw) } });
        }
        const adRecords: AdRecord[] = ads.map((a) => ({
          source: a.source,
          country,
          fetchedAt: a.fetchedAt,
          raw: a.raw,
          keyword: a.keyword,
          coverage: a.coverage,
          activeAds: a.activeAds,
          advertisers: a.advertisers,
          capped: a.capped,
          newAdsPerWeek: a.newAdsPerWeek as { weekStart: string; count: number }[],
          firstSeen: a.firstSeen,
          samples: a.samples as unknown as AdSample[],
        }));

        const stored = references.find((r) => r.country === country && r.keyword === signal.keyword);
        let reference: PriceRecord | null = null;
        if (stored) {
          await db.referencePrice.create({ data: { ...copyFields(stored), runId: run.id, raw: asJson(stored.raw) } });
          reference = {
            source: stored.source,
            country,
            fetchedAt: stored.fetchedAt,
            raw: stored.raw,
            keyword: stored.keyword,
            medianPrice: Number(stored.medianPrice),
            currency: stored.currency,
            sampleSize: stored.sampleSize,
          };
        }

        await scoreKeyword(scoring, {
          keyword: signal.keyword,
          country,
          trend,
          demandSignalId: newSignal.id,
          groups: [...groups.values()],
          ads: combineAdSignals(adRecords),
          // Keine neue Shopping-Suche: gespeicherter Preis zum Keyword, sonst Kategorie-Faktor
          reference: reference ? async () => reference : null,
        });
      }
      console.log(`  ${country}: fertig`);
    }
    funnel.candidates = scoring.stats.candidates;
    if (errors.some((e) => e.level !== "warnung")) status = "PARTIAL";
  } catch (error) {
    status = "FAILED";
    errors.push({ source: "rescore", message: errorMessage(error) });
  }
  await db.run.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), errors: asJson(errors) } });

  console.log(`\nNachbewertung ${run.id}: ${status} (Original: ${runId})`);
  console.log(`  Vorher:  ${before.curves} Trendkurven → ${before.qualified} mit Trend-Dynamik → ${before.offers} Angebote → ${before.candidates} Kandidaten → ${before.cards} Karten`);
  console.log(`  Nachher: ${formatFunnel(funnel, await countCards(db, run.id))}`);

  console.log(`\nVerworfene Keywords (${rejected.length}):`);
  for (const r of rejected) console.log(`  - ${r.country} „${r.keyword}“ – ${r.by === "claude" ? "Claude: " : ""}${r.reason}`);
  printDroppedOffers(scoring.dropped, Infinity);
  printMessages(errors);
  await printTopCandidates(db, run.id);

  // Kontrolle: SerpApi-Verbrauch muss unverändert sein
  let code = status === "FAILED" ? 1 : 0;
  const leftAfter = await serpApiLeft(env.SERPAPI_API_KEY);
  if (leftBefore !== null && leftAfter !== null) {
    if (leftAfter < leftBefore) {
      console.error(`\nACHTUNG: SerpApi-Kontostand gesunken (${leftBefore} → ${leftAfter}). Das darf bei einer Nachbewertung nicht passieren – bitte melden.`);
      code = 1;
    } else {
      console.log(`\nSerpApi-Kontostand nachher: ${leftAfter} Suchen übrig – unverändert.`);
    }
  }
  await db.$disconnect();
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("Nachbewertung abgebrochen:", errorMessage(error));
    process.exit(1);
  });
