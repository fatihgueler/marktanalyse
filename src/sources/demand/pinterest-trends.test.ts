import { describe, expect, it } from "vitest";
import { HeuristicHashtagClassifier } from "@/matching/hashtag-classifier";
import type { TokenStore } from "../types";
import { PinterestAuth, parseTrends, timeSeriesToWeekly } from "./pinterest-trends";
import { PinterestTrendsMockSource } from "./pinterest-trends.mock";

describe("timeSeriesToWeekly", () => {
  it("legt das Wochenende (Schlüssel) auf den Montag der Woche und sortiert", () => {
    // 2026-09-20 ist ein Sonntag → Woche ab Montag 2026-09-14
    expect(timeSeriesToWeekly({ "2026-09-20": 80, "2026-09-13": 40, kaputt: 1 })).toEqual([
      { weekStart: "2026-09-07", value: 40 },
      { weekStart: "2026-09-14", value: 80 },
    ]);
  });
});

describe("parseTrends", () => {
  it("liest die Felder laut OpenAPI-Beschreibung", () => {
    const [trend] = parseTrends({
      trends: [{ keyword: "Wolkenlampe ", pct_growth_wow: 45, pct_growth_mom: 320, pct_growth_yoy: 10001, time_series: { "2026-09-20": 100 } }],
    });
    expect(trend).toEqual({ keyword: "wolkenlampe", growthWow: 45, growthMom: 320, growthYoy: 10001, series: [{ weekStart: "2026-09-14", value: 100 }] });
  });

  it("meldet ein geändertes Format", () => {
    expect(() => parseTrends({ data: [] })).toThrow();
  });
});

describe("PinterestTrendsMockSource", () => {
  it("findet Produktbegriffe, verwirft allgemeine Trends und liefert 52 Wochen Kurve", async () => {
    const source = new PinterestTrendsMockSource(new HeuristicHashtagClassifier(), new Date("2026-09-27T00:00:00Z"));
    const keywords = await source.discoverKeywords([], "DE");
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords.map((k) => k.seedTerm)).not.toContain("herbst deko ideen");
    const first = keywords[0]!;
    const record = await source.fetchSeries(first.keyword, first.seedTerm, "DE");
    expect(record?.series.length).toBeGreaterThanOrEqual(52);
  });
});

describe("PinterestAuth", () => {
  function memoryStore(initial: string | null): TokenStore & { saved: string | null } {
    return {
      saved: initial,
      async load() {
        return this.saved ? { refreshToken: this.saved, expiresAt: null } : null;
      },
      async save(_provider, token) {
        this.saved = token;
      },
    };
  }

  it("nutzt ohne App-Daten den Access-Token direkt", async () => {
    const auth = new PinterestAuth({ accessToken: "pina_x" }, null);
    expect(auth.canRefresh).toBe(false);
    expect(await auth.accessToken()).toBe("pina_x");
  });

  it("meldet fehlende Zugangsdaten verständlich", async () => {
    await expect(new PinterestAuth({}, null).accessToken()).rejects.toThrow(/PINTEREST_APP_ID/);
  });

  it("verweist auf den Button, solange Pinterest noch nicht verbunden ist", async () => {
    await expect(new PinterestAuth({ appId: "1", appSecret: "s" }, memoryStore(null)).accessToken()).rejects.toThrow(/Mit Pinterest verbinden/);
  });

  it("kann erneuern, sobald App-Daten und ein Refresh-Token (Umgebung oder Speicher) da sind", () => {
    expect(new PinterestAuth({ appId: "1", appSecret: "s", refreshToken: "r" }, null).canRefresh).toBe(true);
    expect(new PinterestAuth({ appId: "1", appSecret: "s" }, memoryStore("r")).canRefresh).toBe(true);
    expect(new PinterestAuth({ appId: "1" }, memoryStore("r")).canRefresh).toBe(false);
  });
});
