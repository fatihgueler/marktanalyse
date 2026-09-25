import { describe, expect, it } from "vitest";
import { scoreCompetition } from "./competition";
import { makeTestConfig } from "./test-config";

const config = makeTestConfig().competition;

describe("scoreCompetition", () => {
  it("berechnet die Sättigung logarithmisch (Handrechnung)", () => {
    const result = scoreCompetition({ resultCount: 999, orders30dSum: 99 }, config);
    expect(result.resultsSaturation).toBeCloseTo(3 / 5); // log10(1000) / 5
    expect(result.ordersSaturation).toBeCloseTo(2 / 5); // log10(100) / 5
    expect(result.saturation).toBeCloseTo(0.5);
    expect(result.score).toBeCloseTo(0.5);
  });

  it("sinkt, je mehr Anbieter es gibt", () => {
    const few = scoreCompetition({ resultCount: 500, orders30dSum: 1000 }, config);
    const many = scoreCompetition({ resultCount: 150_000, orders30dSum: 1000 }, config);
    expect(many.score).toBeLessThan(few.score);
  });

  it("sinkt, je mehr Bestellungen es gibt", () => {
    const low = scoreCompetition({ resultCount: 5000, orders30dSum: 200 }, config);
    const high = scoreCompetition({ resultCount: 5000, orders30dSum: 80_000 }, config);
    expect(high.score).toBeLessThan(low.score);
  });

  it("bleibt bei extremen Werten in 0..1", () => {
    expect(scoreCompetition({ resultCount: 1e12, orders30dSum: 1e12 }, config).score).toBe(0);
    expect(scoreCompetition({ resultCount: 0, orders30dSum: 0 }, config).score).toBe(1);
  });

  it("behandelt fehlende Angaben neutral", () => {
    const result = scoreCompetition({ resultCount: null, orders30dSum: null }, config);
    expect(result.score).toBeCloseTo(0.5);
  });
});
