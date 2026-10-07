import { describe, expect, it } from "vitest";
import { scoreCompetition } from "./competition";
import { competitionLevel, growthWords, rankingReason, rankingVerdict } from "./ranking";
import { makeTestConfig } from "./test-config";
import { scoreTrend } from "./trend";

const config = makeTestConfig();
const weeks = (old: number, previous: number, recent: number) => [...Array(44).fill(old), ...Array(4).fill(previous), ...Array(4).fill(recent)];
const rising = scoreTrend(weeks(2, 20, 80), config.trend);
const falling = scoreTrend(weeks(40, 60, 50), config.trend);
const noise = scoreTrend(weeks(1, 1, 2), config.trend);
const lowCompetition = scoreCompetition({ resultCount: 100, orders30dSum: 50, advertisers: 0 }, config.competition);
const highCompetition = scoreCompetition({ resultCount: 1e6, orders30dSum: 1e6, advertisers: 500 }, config.competition);

describe("rankingVerdict", () => {
  const base = { trend: rising, competition: lowCompetition, total: 75, belowMinMargin: false };
  it("„Jetzt testen“ bei steigendem Trend, gutem Score und wenig Wettbewerb", () => {
    expect(rankingVerdict(base, config)).toBe("Jetzt testen");
  });
  it("„Beobachten“ bei schwächerem Score oder Rauschen", () => {
    expect(rankingVerdict({ ...base, total: 45 }, config)).toBe("Beobachten");
    expect(rankingVerdict({ ...base, trend: noise }, config)).toBe("Beobachten");
  });
  it("„Zu spät“ bei fallendem Trend oder hohem Wettbewerb", () => {
    expect(rankingVerdict({ ...base, trend: falling }, config)).toBe("Zu spät");
    expect(rankingVerdict({ ...base, competition: highCompetition }, config)).toBe("Zu spät");
  });
  it("„Marge zu dünn“ hat Vorrang", () => {
    expect(rankingVerdict({ ...base, belowMinMargin: true }, config)).toBe("Marge zu dünn");
  });
});

describe("rankingReason", () => {
  const base = { trend: rising, competition: lowCompetition, total: 75, belowMinMargin: false };
  it("begründet passend zum Urteil", () => {
    expect(rankingReason(base, config)).toMatch(/Test-Drop/);
    expect(rankingReason({ ...base, trend: falling }, config)).toMatch(/steigt nicht mehr/);
    expect(rankingReason({ ...base, competition: highCompetition }, config)).toMatch(/viele Anbieter/);
    expect(rankingReason({ ...base, trend: noise }, config)).toMatch(/zu schwach/);
    expect(rankingReason({ ...base, belowMinMargin: true }, config)).toMatch(/Mindestmarge/);
  });
});

describe("Worte statt Zahlen", () => {
  it("beschreibt das Wachstum", () => {
    expect(growthWords(rising, config)).toBe("stark steigend");
    expect(growthWords(falling, config)).toBe("fallend");
    expect(growthWords(noise, config)).toBe("Signal zu schwach");
    expect(growthWords(scoreTrend(weeks(40, 40, 44), config.trend), config)).toBe("leicht steigend");
    expect(growthWords(scoreTrend(weeks(40, 40, 60), config.trend), config)).toBe("steigend");
  });
  it("stuft den Wettbewerb ein", () => {
    expect(competitionLevel(lowCompetition, config)).toBe("niedrig");
    expect(competitionLevel(highCompetition, config)).toBe("hoch");
  });
});
