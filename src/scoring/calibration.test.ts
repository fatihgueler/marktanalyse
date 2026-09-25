import { describe, expect, it } from "vitest";
import { calibrationStats, type CalibrationRow } from "./calibration";
import { makeTestConfig } from "./test-config";

const config = makeTestConfig().calibration;

function row(verdict: CalibrationRow["verdict"], trend: number, margin: number, competition: number, adMomentum: number | null = null): CalibrationRow {
  return { verdict, trend, margin, competition, total: 100 * (0.5 * trend + 0.35 * margin + 0.15 * competition), adMomentum };
}

describe("calibrationStats", () => {
  it("meldet zu wenige Daten unterhalb der Mindestanzahl je Gruppe", () => {
    const result = calibrationStats([row("TOP", 0.9, 0.5, 0.5), row("FLOP", 0.2, 0.5, 0.5)], config);
    expect(result.enoughData).toBe(false);
    expect(result.signals.every((s) => s.assessment === "zu wenige Daten")).toBe(true);
  });

  it("erkennt trennende, neutrale und umgekehrte Signale (Handrechnung)", () => {
    const rows = [
      row("TOP", 0.9, 0.5, 0.3, 2),
      row("TOP", 0.8, 0.5, 0.3, 1),
      row("TOP", 0.7, 0.5, 0.3, 3),
      row("FLOP", 0.3, 0.5, 0.6, 0),
      row("FLOP", 0.2, 0.5, 0.6, 0),
      row("FLOP", 0.4, 0.5, 0.6, null),
      row("OK", 0.5, 0.5, 0.5),
    ];
    const result = calibrationStats(rows, config);
    expect(result.counts).toEqual({ TOP: 3, OK: 1, FLOP: 3 });
    const byKey = Object.fromEntries(result.signals.map((s) => [s.key, s]));
    expect(byKey.trend?.difference).toBeCloseTo(0.5); // 0,8 − 0,3
    expect(byKey.trend?.assessment).toBe("trennt gut");
    expect(byKey.margin?.assessment).toBe("trennt nicht");
    expect(byKey.competition?.difference).toBeCloseTo(-0.3);
    expect(byKey.competition?.assessment).toBe("umgekehrt");
    // Werbe-Dynamik: nur 2 Flops mit Wert → zu wenige Daten
    expect(byKey.adMomentum?.assessment).toBe("zu wenige Daten");
  });

  it("bewertet eine kleine positive Differenz als schwach", () => {
    const rows = [0.6, 0.6, 0.6].map((t) => row("TOP", t, 0.5, 0.5)).concat([0.5, 0.5, 0.5].map((t) => row("FLOP", t, 0.5, 0.5)));
    const trend = calibrationStats(rows, config).signals.find((s) => s.key === "trend");
    expect(trend?.assessment).toBe("trennt schwach");
  });
});
