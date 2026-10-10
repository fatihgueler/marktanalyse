import { describe, expect, it } from "vitest";
import { minimumSerpApiSearches, perRunBudget, worstCaseApifyUsd, worstCaseSerpApiSearches, validateConfig } from "@/config/config-check";
import { radarConfig } from "@/config/radar.config";
import { makeTestConfig } from "@/scoring/test-config";
import { SearchBudget, countryShare, quotaDecision } from "./budget";

describe("SearchBudget", () => {
  it("gibt genau `limit` Aufrufe frei", () => {
    const budget = new SearchBudget("Test", 2);
    expect(budget.tryTake()).toBe(true);
    budget.take();
    expect(budget.tryTake()).toBe(false);
    expect(() => budget.take()).toThrow(/Budget/);
    expect(budget.consumed).toBe(2);
  });

  it("hält eine Zwischengrenze ein und gibt danach den Rest frei", () => {
    const budget = new SearchBudget("Test", 10);
    budget.take();
    budget.setCeiling(3);
    expect(budget.available).toBe(2);
    expect([budget.tryTake(), budget.tryTake(), budget.tryTake()]).toEqual([true, true, false]);
    budget.setCeiling(null);
    expect(budget.available).toBe(7);
  });
});

describe("countryShare", () => {
  it("verteilt das Restbudget auf die verbleibenden Länder und reserviert Shopping", () => {
    // 230 Suchen, zwei Länder (DE, AT): DE bekommt 115, davon höchstens 107 für Trends
    expect(countryShare(230, 2, 8)).toEqual({ share: 115, trendCap: 107 });
    // DE hat nur 70 gebraucht → AT bekommt den ganzen Rest
    expect(countryShare(160, 1, 8)).toEqual({ share: 160, trendCap: 152 });
    expect(countryShare(5, 1, 8)).toEqual({ share: 5, trendCap: 0 });
  });
});

describe("Kostenrahmen der Config", () => {
  it("die ausgelieferte Config bleibt im Budget (SerpApi Starter, Apify Gratis)", () => {
    const budget = perRunBudget(radarConfig);
    expect(budget.serpApiSearches).toBe(230); // 1.000 ÷ 4,33
    expect(minimumSerpApiSearches(radarConfig)).toBeLessThanOrEqual(budget.serpApiSearches);
    expect(worstCaseApifyUsd(radarConfig)).toBeLessThanOrEqual(budget.apifyUsd);
  });

  it("rechnet den SerpApi-Verbrauch nach (Handrechnung)", () => {
    // Entdeckung je Land: 10 Seeds + 4 Kategorien + 1 Trending Now = 15, × 4 Länder = 60; reservierte Preise 4 × 8 = 32
    expect(minimumSerpApiSearches(radarConfig)).toBe(92);
    // ohne Budgetgrenze: 60 Entdeckung + 4 × (45 Kurven + 45 Preise) – die harte Grenze von 230 greift vorher
    expect(worstCaseSerpApiSearches(radarConfig)).toBe(420);
  });

  it("lehnt eine Config ab, die das SerpApi-Budget sprengen kann", () => {
    const config = makeTestConfig();
    config.budget.serpApiMonthlySearches = 250; // Gratis-Plan
    expect(() => validateConfig(config)).toThrow(/SerpApi-Suchen/);
  });

  it("lehnt eine Config ab, die das Apify-Budget sprengen kann", () => {
    const config = makeTestConfig();
    config.scraping.alibaba1688.maxSearchesPerCountry = 100;
    expect(() => validateConfig(config)).toThrow(/Apify/);
  });
});

describe("quotaDecision", () => {
  it("läuft normal, solange das Kontingent für einen vollen Lauf reicht", () => {
    expect(quotaDecision(900, 230, 100)).toEqual({ action: "ok", limit: 230 });
  });
  it("kappt das Budget auf den Rest, wenn es knapp wird", () => {
    expect(quotaDecision(150, 230, 100)).toEqual({ action: "cap", limit: 150 });
  });
  it("lässt den Lauf aus, wenn zu wenig übrig ist (z. B. 26 Suchen im Gratis-Plan)", () => {
    expect(quotaDecision(26, 230, 100)).toEqual({ action: "skip", limit: 0 });
  });
});

describe("SearchBudget.capTo", () => {
  it("senkt das Budget, erhöht es aber nie", () => {
    const budget = new SearchBudget("Test", 10);
    budget.capTo(3);
    expect(budget.limit).toBe(3);
    budget.capTo(50);
    expect(budget.limit).toBe(3);
  });
});
