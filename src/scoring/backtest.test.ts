import { describe, expect, it } from "vitest";
import { addWeeks, isoDate } from "@/lib/weeks";
import { runBacktest, summarizeBacktests } from "./backtest";
import { makeTestConfig } from "./test-config";

const config = makeTestConfig();
const START = new Date("2022-01-03T00:00:00Z");
const toSeries = (values: number[]) => values.map((value, i) => ({ weekStart: isoDate(addWeeks(START, i)), value }));

/** 120 Wochen kaum Interesse, dann zwölf Wochen exponentieller Anstieg bis 100, danach Abklingen. */
function takeoff(): number[] {
  const values: number[] = Array(120).fill(2);
  for (let i = 1; i <= 12; i++) values.push(Math.round(2 * 1.39 ** i));
  for (let i = 1; i <= 20; i++) values.push(Math.max(10, 100 - i * 4));
  return values;
}

describe("runBacktest", () => {
  it("findet einen klassischen Anstieg Wochen vor dem Höhepunkt", () => {
    const result = runBacktest(toSeries(takeoff()), config);
    expect(result.peak.index).toBe(131);
    expect(result.status).toBe("rechtzeitig");
    expect(result.leadWeeks).toBeGreaterThanOrEqual(4);
    // Je Woche neu auf das Jahresmaximum normiert, wirkt die alte Grundlinie früh im Anstieg relativ hoch.
    expect(["Frühphase", "Wachstum"]).toContain(result.firstSignal?.phase);
    expect(result.earlierSignals).toBe(0);
  });

  it("nennt einen Sprung über Nacht „knapp“", () => {
    const values = [...Array(120).fill(3), 100, 90, 80, 70];
    const result = runBacktest(toSeries(values), config);
    expect(result.peak.index).toBe(120);
    expect(result.leadWeeks).toBe(0);
    expect(result.status).toBe("knapp");
  });

  it("gibt bei gleichbleibendem Interesse kein Signal", () => {
    const values = Array.from({ length: 150 }, (_, i) => 50 + (i % 3));
    const result = runBacktest(toSeries(values), config);
    expect(result.signalWeeks).toBe(0);
  });

  it("zählt jährliche Saisonspitzen vor dem Höhepunkt als frühere Signale", () => {
    // drei Jahre Saisonware: jedes Jahr ein Anstieg, der letzte am höchsten
    const year = (top: number) => [...Array(40).fill(4), ...[10, 20, 40, top, 40, 15], ...Array(6).fill(4)];
    const result = runBacktest(toSeries([...year(80), ...year(90), ...year(100)]), config);
    expect(result.earlierSignals).toBeGreaterThan(0);
  });

  it("meldet zu wenig Vorlauf, wenn der Höhepunkt zu früh in der Datei liegt", () => {
    const values = [...Array(30).fill(2), 100, ...Array(30).fill(5)];
    expect(runBacktest(toSeries(values), config).status).toBe("zu wenig Vorlauf");
  });
});

describe("summarizeBacktests", () => {
  it("fasst Treffer und Vorlauf zusammen", () => {
    const results = [
      runBacktest(toSeries(takeoff()), config),
      runBacktest(toSeries([...Array(120).fill(3), 100, 90]), config),
      runBacktest(toSeries(Array.from({ length: 150 }, (_, i) => 50 + (i % 3))), config),
    ];
    const summary = summarizeBacktests(results);
    // gleichbleibende Reihe: Maximum in Woche 2 → zu wenig Vorlauf, zählt nicht mit
    expect(summary).toMatchObject({ total: 3, inTime: 1, tight: 1, missed: 0, evaluated: 2 });
    expect(summary.medianLeadWeeks).toBe((results[0]!.leadWeeks! + 0) / 2);
  });
});
