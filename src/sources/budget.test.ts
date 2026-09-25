import { describe, expect, it } from "vitest";
import { perRunBudget, worstCaseApifyUsd, worstCaseSerpApiSearches, validateConfig } from "@/config/config-check";
import { radarConfig } from "@/config/radar.config";
import { makeTestConfig } from "@/scoring/test-config";
import { SearchBudget } from "./budget";

describe("SearchBudget", () => {
  it("gibt genau `limit` Aufrufe frei", () => {
    const budget = new SearchBudget("Test", 2);
    expect(budget.tryTake()).toBe(true);
    budget.take();
    expect(budget.tryTake()).toBe(false);
    expect(() => budget.take()).toThrow(/Budget/);
    expect(budget.consumed).toBe(2);
  });
});

describe("Kostenrahmen der Config", () => {
  it("die ausgelieferte Config bleibt im Budget (SerpApi Starter, Apify Gratis)", () => {
    const budget = perRunBudget(radarConfig);
    expect(budget.serpApiSearches).toBe(230); // 1.000 ÷ 4,33
    expect(worstCaseSerpApiSearches(radarConfig)).toBeLessThanOrEqual(budget.serpApiSearches);
    expect(worstCaseApifyUsd(radarConfig)).toBeLessThanOrEqual(budget.apifyUsd);
  });

  it("rechnet den ungünstigsten SerpApi-Verbrauch nach (Handrechnung)", () => {
    // Seeds: DE 8 + AT 6 + CH 6 + GB 8 = 28; Kurven 4 × 45 = 180; Preise 4 × 5 = 20
    expect(worstCaseSerpApiSearches(radarConfig)).toBe(228);
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
