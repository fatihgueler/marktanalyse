import { describe, expect, it } from "vitest";
import { scoreCompetition } from "./competition";
import { makeTestConfig } from "./test-config";

const config = makeTestConfig().competition;

describe("scoreCompetition", () => {
  it("berechnet die Sättigung logarithmisch aus drei Signalen (Handrechnung)", () => {
    const result = scoreCompetition({ resultCount: 999, orders30dSum: 99, advertisers: 9 }, config);
    expect(result.resultsSaturation).toBeCloseTo(3 / 5); // log10(1000) / 5
    expect(result.ordersSaturation).toBeCloseTo(2 / 5); // log10(100) / 5
    expect(result.advertisersSaturation).toBeCloseTo(1 / 2); // log10(10) / 2
    // 0,25 · 0,6 + 0,25 · 0,4 + 0,5 · 0,5
    expect(result.saturation).toBeCloseTo(0.5);
    expect(result.score).toBeCloseTo(0.5);
  });

  it("sinkt, je mehr Anbieter es gibt", () => {
    const few = scoreCompetition({ resultCount: 500, orders30dSum: 1000, advertisers: 5 }, config);
    const many = scoreCompetition({ resultCount: 150_000, orders30dSum: 1000, advertisers: 5 }, config);
    expect(many.score).toBeLessThan(few.score);
  });

  it("sinkt, je mehr Bestellungen es gibt", () => {
    const low = scoreCompetition({ resultCount: 5000, orders30dSum: 200, advertisers: 5 }, config);
    const high = scoreCompetition({ resultCount: 5000, orders30dSum: 80_000, advertisers: 5 }, config);
    expect(high.score).toBeLessThan(low.score);
  });

  it("gewichtet den Werbedruck am stärksten", () => {
    const quiet = scoreCompetition({ resultCount: 5000, orders30dSum: 1000, advertisers: 1 }, config);
    const crowded = scoreCompetition({ resultCount: 5000, orders30dSum: 1000, advertisers: 120 }, config);
    expect(crowded.advertisersSaturation).toBe(1);
    expect(quiet.score - crowded.score).toBeGreaterThan(0.3);
  });

  it("bleibt bei extremen Werten in 0..1", () => {
    expect(scoreCompetition({ resultCount: 1e12, orders30dSum: 1e12, advertisers: 1e6 }, config).score).toBe(0);
    expect(scoreCompetition({ resultCount: 0, orders30dSum: 0, advertisers: 0 }, config).score).toBe(1);
  });

  it("behandelt fehlende Angaben und Länder ohne Werbedaten neutral", () => {
    const result = scoreCompetition({ resultCount: null, orders30dSum: null, advertisers: null }, config);
    expect(result.advertisersSaturation).toBe(0.5);
    expect(result.score).toBeCloseTo(0.5);
  });
});
