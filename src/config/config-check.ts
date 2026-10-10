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
  // Mehr als das Budget verbraucht ein Lauf nie (harte Grenze in SearchBudget); prüfen muss die Config nur,
  // dass Entdeckung und die reservierten Shopping-Suchen hineinpassen.
  const serp = minimumSerpApiSearches(config);
  if (serp > budget.serpApiSearches) {
    throw new Error(
      `Config: Entdeckung und reservierte Shopping-Preise brauchen ${serp} SerpApi-Suchen, das Budget erlaubt ${budget.serpApiSearches} ` +
        "(budget.serpApiMonthlySearches ÷ runsPerMonth). demand.maxSeedsPerCountry oder referencePrice.minLookupsPerCountry senken.",
    );
  }
  if (config.referencePrice.minLookupsPerCountry > config.referencePrice.maxLookupsPerCountry) {
    throw new Error("Config: referencePrice.minLookupsPerCountry darf nicht größer als maxLookupsPerCountry sein.");
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

function seedSearches(config: RadarConfig): { seeds: number; countries: number } {
  const countries = Object.keys(config.countries) as (keyof RadarConfig["countries"])[];
  // Entdeckung je Land: Seeds + Kategorie-Abfragen ohne Startbegriff + ggf. eine „Trending Now“-Abfrage
  const perCountryExtra =
    Math.min(config.demand.discoveryCategories.length, config.demand.maxCategoriesPerCountry) + (config.demand.trendingNow.enabled ? 1 : 0);
  const seeds = countries.reduce((sum, c) => sum + Math.min(config.demand.seeds[c].length, config.demand.maxSeedsPerCountry) + perCountryExtra, 0);
  return { seeds, countries: countries.length };
}

/** SerpApi-Suchen ohne Budgetgrenze, wenn alle vier Länder alles ausschöpfen (Entdeckung + Kurven + Preise). */
export function worstCaseSerpApiSearches(config: RadarConfig = radarConfig): number {
  const { seeds, countries } = seedSearches(config);
  return seeds + countries * (config.demand.maxKeywordsPerCountry + config.referencePrice.maxLookupsPerCountry);
}

/** Was ein Lauf mindestens unterbringen muss: Entdeckung aller Seeds + reservierte Shopping-Suchen je Land. */
export function minimumSerpApiSearches(config: RadarConfig = radarConfig): number {
  const { seeds, countries } = seedSearches(config);
  return seeds + countries * config.referencePrice.minLookupsPerCountry;
}

/** Höchstbetrag Apify je Lauf laut Config (alle Kostengrenzen ausgeschöpft). */
export function worstCaseApifyUsd(config: RadarConfig = radarConfig): number {
  const { tiktokTopAds, alibaba1688 } = config.scraping;
  return (
    tiktokTopAds.countries.length * tiktokTopAds.maxChargeUsd +
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
