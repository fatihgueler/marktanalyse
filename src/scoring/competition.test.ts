import { describe, expect, it } from "vitest";
import { scoreCompetition } from "./competition";
import { makeTestConfig } from "./test-config";

const config = makeTestConfig().competition;

describe("scoreCompetition", () => {
  it("berechnet die Sättigung logarithmisch aus vier Signalen (Handrechnung)", () => {
    const result = scoreCompetition({ resultCount: 999, orders30dSum: 99, advertisers: 9, marketplaceListings: 99 }, config);
    expect(result.resultsSaturation).toBeCloseTo(3 / 5); // log10(1000) / 5
    expect(result.ordersSaturation).toBeCloseTo(2 / 5); // log10(100) / 5
    expect(result.advertisersSaturation).toBeCloseTo(1 / 2); // log10(10) / 2
    expect(result.marketplaceSaturation).toBeCloseTo(2 / 4); // log10(100) / 4
    // 0,15 · 0,6 + 0,2 · 0,4 + 0,25 · 0,5 + 0,4 · 0,5 = 0,09 + 0,08 + 0,125 + 0,2
    expect(result.saturation).toBeCloseTo(0.495);
    expect(result.score).toBeCloseTo(0.505);
  });

  it("sinkt, je mehr Angebote es auf eBay im Zielland gibt", () => {
    const rare = scoreCompetition({ resultCount: 5000, orders30dSum: 1000, advertisers: 5, marketplaceListings: 20 }, config);
    const common = scoreCompetition({ resultCount: 5000, orders30dSum: 1000, advertisers: 5, marketplaceListings: 40_000 }, config);
    expect(common.marketplaceSaturation).toBe(1);
    expect(common.score).toBeLessThan(rare.score);
  });

  it("sinkt, je mehr Anbieter es gibt", () => {
    const few = scoreCompetition({ resultCount: 500, orders30dSum: 1000, advertisers: 5, marketplaceListings: null }, config);
    const many = scoreCompetition({ resultCount: 150_000, orders30dSum: 1000, advertisers: 5, marketplaceListings: null }, config);
    expect(many.score).toBeLessThan(few.score);
  });

  it("sinkt, je mehr Bestellungen es gibt", () => {
    const low = scoreCompetition({ resultCount: 5000, orders30dSum: 200, advertisers: 5, marketplaceListings: null }, config);
    const high = scoreCompetition({ resultCount: 5000, orders30dSum: 80_000, advertisers: 5, marketplaceListings: null }, config);
    expect(high.score).toBeLessThan(low.score);
  });

  it("gewichtet den Werbedruck am stärksten", () => {
    const quiet = scoreCompetition({ resultCount: 5000, orders30dSum: 1000, advertisers: 1, marketplaceListings: null }, config);
    const crowded = scoreCompetition({ resultCount: 5000, orders30dSum: 1000, advertisers: 120, marketplaceListings: null }, config);
    expect(crowded.advertisersSaturation).toBe(1);
    expect(quiet.score - crowded.score).toBeGreaterThan(0.3);
  });

  it("bleibt bei extremen Werten in 0..1", () => {
    expect(scoreCompetition({ resultCount: 1e12, orders30dSum: 1e12, advertisers: 1e6, marketplaceListings: 1e9 }, config).score).toBe(0);
    expect(scoreCompetition({ resultCount: 0, orders30dSum: 0, advertisers: 0, marketplaceListings: 0 }, config).score).toBe(1);
  });

  it("behandelt fehlende Angaben und Länder ohne Werbedaten neutral", () => {
    const result = scoreCompetition({ resultCount: null, orders30dSum: null, advertisers: null, marketplaceListings: null }, config);
    expect(result.advertisersSaturation).toBe(0.5);
    expect(result.marketplaceSaturation).toBe(0.5);
    expect(result.score).toBeCloseTo(0.5);
  });
});
