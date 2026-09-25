import { describe, expect, it } from "vitest";
import { configVersion, validateConfig } from "@/config/config-check";
import { radarConfig } from "@/config/radar.config";
import { scoreCompetition } from "./competition";
import { calculateMargin } from "./margin";
import { totalScore } from "./score";
import { makeTestConfig } from "./test-config";
import { scoreTrend } from "./trend";

const config = makeTestConfig();
const trend = scoreTrend([...Array<number>(44).fill(3), ...Array<number>(4).fill(10), ...Array<number>(4).fill(40)], config.trend);
const margin = calculateMargin(
  {
    country: "DE",
    category: "beleuchtung",
    purchasePrice: 10,
    purchaseCurrency: "EUR",
    shippingCost: null,
    shippingCurrency: "EUR",
    referencePrice: 34.99,
    referenceCurrency: "EUR",
  },
  config,
);
const competition = scoreCompetition({ resultCount: 999, orders30dSum: 99 }, config.competition);

describe("totalScore", () => {
  it("gewichtet die Teil-Scores und skaliert auf 0..100 (Handrechnung)", () => {
    const result = totalScore({ trend, margin, competition, relevance: 1 }, config.score);
    const expected = 0.5 * trend.score + 0.35 * margin.score + 0.15 * competition.score;
    expect(result.baseScore).toBeCloseTo(expected);
    expect(result.total).toBeCloseTo(100 * expected);
    expect(result.contributions.trend + result.contributions.margin + result.contributions.competition).toBeCloseTo(
      result.baseScore,
    );
  });

  it("skaliert mit der Match-Relevanz", () => {
    const full = totalScore({ trend, margin, competition, relevance: 1 }, config.score);
    const half = totalScore({ trend, margin, competition, relevance: 0.5 }, config.score);
    expect(half.total).toBeCloseTo(full.total / 2);
  });

  it("bestraft unsichere Matches stärker bei höherem Exponenten", () => {
    const strict = { ...config.score, relevanceExponent: 2 };
    expect(totalScore({ trend, margin, competition, relevance: 0.5 }, strict).relevanceFactor).toBeCloseTo(0.25);
  });

  it("begrenzt die Relevanz auf 0..1", () => {
    expect(totalScore({ trend, margin, competition, relevance: 1.7 }, config.score).relevance).toBe(1);
  });
});

describe("Config", () => {
  it("die ausgelieferte radar.config.ts ist gültig", () => {
    expect(() => validateConfig(radarConfig)).not.toThrow();
  });

  it("erkennt Gewichte, die sich nicht zu 1 summieren", () => {
    const broken = makeTestConfig();
    broken.score.weights = { trend: 0.5, margin: 0.5, competition: 0.5 };
    expect(() => validateConfig(broken)).toThrow(/summieren/);
  });

  it("erkennt eine Zielmarge unterhalb der Mindestmarge", () => {
    const broken = makeTestConfig();
    broken.margin.targetMarginPct = 0.1;
    expect(() => validateConfig(broken)).toThrow(/targetMarginPct/);
  });

  it("ändert die Config-Version bei jeder Änderung", () => {
    const changed = makeTestConfig();
    changed.fees.paymentFeePct = 0.03;
    expect(configVersion(changed)).not.toBe(configVersion(makeTestConfig()));
  });
});
