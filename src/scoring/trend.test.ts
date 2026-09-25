import { describe, expect, it } from "vitest";
import { scoreTrend } from "./trend";
import { makeTestConfig } from "./test-config";

const config = makeTestConfig().trend;

/** 44 Wochen Baseline + 4 Vorperiode + 4 aktuell = 52 Wochen */
function series(baseline: number, previous: number, recent: number): number[] {
  return [...Array<number>(44).fill(baseline), ...Array<number>(4).fill(previous), ...Array<number>(4).fill(recent)];
}

describe("scoreTrend", () => {
  it("berechnet alle Komponenten nachvollziehbar (Handrechnung)", () => {
    // recent 40, previous 10, baseline 3
    const result = scoreTrend(series(3, 10, 40), config);
    expect(result.recent).toBe(40);
    expect(result.previous).toBe(10);
    expect(result.baseline).toBe(3);
    expect(result.growth).toBeCloseTo(3); // (40 − 10) / max(10, 5)
    expect(result.growthComponent).toBeCloseTo(0.75); // 3 / (3 + 1)
    expect(result.earlyComponent).toBeCloseTo(0.9); // 1 − 3/30
    expect(result.levelComponent).toBeCloseTo(0.4);
    // 0.55·0.75 + 0.35·0.9 + 0.1·0.4 = 0.4125 + 0.315 + 0.04
    expect(result.score).toBeCloseTo(0.7675);
    expect(result.rejectedReason).toBeNull();
  });

  it("bewertet eine Frühphase höher als ein gesättigtes Hoch-Plateau", () => {
    const early = scoreTrend(series(2, 8, 30), config);
    const saturated = scoreTrend(series(90, 95, 100), config);
    expect(early.score).toBeGreaterThan(saturated.score);
    // Plateau: kaum Wachstum, keine Frühphase → nur der kleine Niveau-Anteil bleibt
    expect(saturated.earlyComponent).toBe(0);
    expect(saturated.score).toBeLessThan(0.2);
  });

  it("gibt bei fallendem Interesse keine Wachstumspunkte", () => {
    const result = scoreTrend(series(20, 80, 40), config);
    expect(result.growth).toBeLessThan(0);
    expect(result.growthComponent).toBe(0);
  });

  it("gibt einem abflauenden Strohfeuer keinen Frühphasen-Bonus", () => {
    // kaum Vorgeschichte, Peak in der Vorperiode, jetzt fallend
    const result = scoreTrend(series(1, 90, 30), config);
    expect(result.earlyComponent).toBe(0);
    expect(result.score).toBeCloseTo(0.1 * 0.3); // nur Niveau-Anteil
  });

  it("verhindert Division durch ~0 über den growthFloor", () => {
    const result = scoreTrend(series(0, 0, 20), config);
    expect(result.growth).toBeCloseTo(4); // (20 − 0) / 5
    expect(Number.isFinite(result.score)).toBe(true);
  });

  it("verwirft zu geringes Suchinteresse", () => {
    const result = scoreTrend(series(0, 1, 3), config);
    expect(result.score).toBe(0);
    expect(result.rejectedReason).toMatch(/zu gering/);
  });

  it("verwirft lückenhafte Reihen mit Nullwerten in den letzten Wochen (Rauschen)", () => {
    const values = series(0, 0, 60);
    values[values.length - 2] = 0;
    const result = scoreTrend(values, config);
    expect(result.score).toBe(0);
    expect(result.rejectedReason).toMatch(/Lückenhaft/);
  });

  it("wirft bei zu kurzer Zeitreihe", () => {
    expect(() => scoreTrend([1, 2, 3], config)).toThrow(/zu kurz/);
  });

  it("bleibt im Bereich 0..1", () => {
    const result = scoreTrend(series(0, 5, 100), config);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});
