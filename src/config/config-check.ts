import { createHash } from "node:crypto";
import { radarConfig, type RadarConfig } from "./radar.config";

const WEIGHT_TOLERANCE = 1e-9;

function assertWeightsSumToOne(name: string, weights: Record<string, number>): void {
  const sum = Object.values(weights).reduce((acc, w) => acc + w, 0);
  if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
    throw new Error(`Config: Gewichte in "${name}" summieren sich zu ${sum}, erwartet 1.`);
  }
  for (const [key, w] of Object.entries(weights)) {
    if (w < 0) throw new Error(`Config: Gewicht "${name}.${key}" ist negativ.`);
  }
}

/** Prüft die Config auf innere Widersprüche. Wirft bei Fehlern, bevor ein Lauf startet. */
export function validateConfig(config: RadarConfig = radarConfig): void {
  assertWeightsSumToOne("trend.weights", config.trend.weights);
  assertWeightsSumToOne("competition.weights", config.competition.weights);
  assertWeightsSumToOne("score.weights", config.score.weights);

  const { minMarginPct, targetMarginPct } = config.margin;
  if (!(targetMarginPct > minMarginPct)) {
    throw new Error("Config: margin.targetMarginPct muss größer als margin.minMarginPct sein.");
  }
  if (config.trend.recentWeeks + config.trend.previousWeeks >= config.trend.minSeriesWeeks) {
    throw new Error("Config: trend.minSeriesWeeks muss größer als recentWeeks + previousWeeks sein.");
  }
  const budget = perRunBudget(config);
  const serp = worstCaseSerpApiSearches(config);
  if (serp > budget.serpApiSearches) {
    throw new Error(
      `Config: Ein Lauf kann bis zu ${serp} SerpApi-Suchen verbrauchen, das Budget erlaubt ${budget.serpApiSearches} ` +
        "(budget.serpApiMonthlySearches ÷ runsPerMonth). demand.maxKeywordsPerCountry oder referencePrice.maxLookupsPerCountry senken.",
    );
  }
  const apify = worstCaseApifyUsd(config);
  if (apify > budget.apifyUsd + 1e-9) {
    throw new Error(
      `Config: Ein Lauf kann bis zu ${apify.toFixed(2)} $ bei Apify kosten, das Budget erlaubt ${budget.apifyUsd.toFixed(2)} $. ` +
        "scraping.*.maxChargeUsd oder scraping.alibaba1688.maxSearchesPerCountry senken.",
    );
  }
  for (const [currency, rate] of Object.entries(config.fx)) {
    if (!(rate > 0)) throw new Error(`Config: Wechselkurs ${currency} muss > 0 sein.`);
  }
}

/** Höchstzahl SerpApi-Suchen, die ein Lauf laut Config verbrauchen kann (Entdeckung + Kurven + Preise). */
export function worstCaseSerpApiSearches(config: RadarConfig = radarConfig): number {
  const countries = Object.keys(config.countries) as (keyof RadarConfig["countries"])[];
  const seeds = countries.reduce((sum, c) => sum + Math.min(config.demand.seeds[c].length, config.demand.maxSeedsPerCountry), 0);
  return seeds + countries.length * (config.demand.maxKeywordsPerCountry + config.referencePrice.maxLookupsPerCountry);
}

/** Höchstbetrag Apify je Lauf laut Config (alle Kostengrenzen ausgeschöpft). */
export function worstCaseApifyUsd(config: RadarConfig = radarConfig): number {
  const { tiktokHashtags, alibaba1688 } = config.scraping;
  return (
    tiktokHashtags.countries.length * tiktokHashtags.maxChargeUsd +
    config.wholesale.countries.length * alibaba1688.maxSearchesPerCountry * alibaba1688.maxChargeUsd
  );
}

export function perRunBudget(config: RadarConfig = radarConfig) {
  return {
    serpApiSearches: Math.floor(config.budget.serpApiMonthlySearches / config.budget.runsPerMonth),
    apifyUsd: config.budget.apifyMonthlyUsd / config.budget.runsPerMonth,
  };
}

/** Kurzer, stabiler Hash der Config – wird pro Lauf gespeichert. */
export function configVersion(config: RadarConfig = radarConfig): string {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 12);
}
