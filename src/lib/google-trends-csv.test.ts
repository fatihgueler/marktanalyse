import { describe, expect, it } from "vitest";
import { parseGoogleTrendsCsv } from "./google-trends-csv";

function weeklyCsv(header: string, rows: [string, string][], delimiter = ","): string {
  return [header, "", `Woche${delimiter}wolkenlampe: (Deutschland)`, ...rows.map(([d, v]) => `${d}${delimiter}${v}`)].join("\n");
}

describe("parseGoogleTrendsCsv", () => {
  it("liest das klassische Wochenformat mit Vorspann und „<1“", () => {
    const csv = weeklyCsv("Kategorie: Alle Kategorien", [
      ["2026-09-06", "<1"],
      ["2026-09-13", "12"],
      ["2026-09-20", "100"],
    ]);
    const parsed = parseGoogleTrendsCsv(csv);
    expect(parsed.keyword).toBe("wolkenlampe");
    expect(parsed.granularity).toBe("Wochen");
    // Sonntag 2026-09-06 → Montag 2026-09-07
    expect(parsed.series).toEqual([
      { weekStart: "2026-09-07", value: 0.5 },
      { weekStart: "2026-09-14", value: 12 },
      { weekStart: "2026-09-21", value: 100 },
    ]);
  });

  it("kommt mit Semikolon, Anführungszeichen, BOM und deutschem Datum zurecht", () => {
    const csv = '﻿"Kategorie: Alle Kategorien"\r\n\r\n"Woche";"wolkenlampe: (Deutschland)"\r\n"06.09.2026";"5"\r\n"13.09.2026";"7"\r\n';
    const parsed = parseGoogleTrendsCsv(csv);
    expect(parsed.series.map((p) => p.value)).toEqual([5, 7]);
    expect(parsed.series[0]!.weekStart).toBe("2026-09-07");
  });

  it("liest das neuere Format ohne Vorspann und mit US-Datum", () => {
    const csv = '"Time","cloud lamp"\n"9/6/2026","40"\n"9/13/2026","60"\n';
    const parsed = parseGoogleTrendsCsv(csv);
    expect(parsed.keyword).toBe("cloud lamp");
    expect(parsed.series.map((p) => p.value)).toEqual([40, 60]);
  });

  it("verdichtet Tageswerte zu Wochen", () => {
    const rows: [string, string][] = Array.from({ length: 21 }, (_, i) => [new Date(Date.UTC(2026, 8, 7 + i)).toISOString().slice(0, 10), String(10 + i)]);
    const parsed = parseGoogleTrendsCsv(weeklyCsv("Kategorie: Alle Kategorien", rows).replace("Woche", "Tag"), new Date("2026-10-07T00:00:00Z"));
    expect(parsed.granularity).toBe("Tage");
    expect(parsed.series).toHaveLength(3);
    expect(parsed.series.at(-1)!.value).toBe(100);
  });

  it("lehnt Monatswerte mit klarer Anleitung ab", () => {
    const csv = weeklyCsv("Kategorie: Alle Kategorien", [
      ["2024-01", "10"],
      ["2024-02", "20"],
    ]);
    expect(() => parseGoogleTrendsCsv(csv)).toThrow(/Letzte 12 Monate/);
  });

  it("meldet Dateien ohne Datenzeilen verständlich", () => {
    expect(() => parseGoogleTrendsCsv("Hallo\nWelt")).toThrow(/Keine Datenzeilen/);
  });
});
