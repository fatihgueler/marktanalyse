import { describe, expect, it } from "vitest";
import { HeuristicHashtagClassifier } from "@/matching/hashtag-classifier";
import { curveToWeeklySeries } from "./curve";
import { parseHashtagItems } from "./tiktok-hashtags";
import { TikTokHashtagsMockSource } from "./tiktok-hashtags.mock";

const now = new Date("2026-09-25T12:00:00Z"); // Freitag, laufende Woche ab 21.09.
const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 1000;

describe("curveToWeeklySeries", () => {
  it("bildet Wochenmittel, verwirft die laufende Woche und normiert auf 100", () => {
    const series = curveToWeeklySeries(
      [
        { timestamp: day("2026-09-07"), value: 10 },
        { timestamp: day("2026-09-09"), value: 30 }, // Woche 07.09.: Ø 20
        { timestamp: day("2026-09-15"), value: 40 }, // Woche 14.09.: Ø 40
        { timestamp: day("2026-09-22"), value: 99 }, // laufende Woche → verworfen
      ],
      now,
    );
    expect(series).toEqual([
      { weekStart: "2026-09-07", value: 50 },
      { weekStart: "2026-09-14", value: 100 },
    ]);
  });
});

describe("parseHashtagItems", () => {
  it("liest die Actor-Ausgabe und lässt Creator-Daten weg", () => {
    const [trend] = parseHashtagItems([
      {
        hashtagName: "CloudLamp",
        rank: 3,
        views: 1000,
        publishCount: 50,
        popularityCurve: [{ timestamp: 1, value: 5 }],
        topCreators: [{ nickname: "person" }],
      },
    ]);
    expect(trend).toEqual({ hashtag: "cloudlamp", rank: 3, views: 1000, posts: 50, curve: [{ timestamp: 1, value: 5 }] });
    expect(JSON.stringify(trend)).not.toContain("person");
  });

  it("überspringt Einträge mit unerwarteter Struktur", () => {
    expect(parseHashtagItems([{ foo: 1 }, null, "x"])).toEqual([]);
  });
});

describe("TikTokHashtagsMockSource", () => {
  const source = new TikTokHashtagsMockSource(new HeuristicHashtagClassifier(), now);

  it("liefert Produkt-Keywords mit Wochenreihe und ignoriert allgemeine Hashtags", async () => {
    const found = await source.discoverKeywords([], "DE");
    const keywords = found.map((f) => f.keyword);
    expect(keywords).toContain("cloud lamp");
    expect(keywords).not.toContain("oktoberfest");
    const record = await source.fetchSeries("cloud lamp", "#cloudlamp", "DE");
    expect(record?.series.length).toBeGreaterThanOrEqual(12);
    expect(Math.max(...(record?.series.map((p) => p.value) ?? [0]))).toBe(100);
  });

  it("liefert für nicht unterstützte Märkte nichts", async () => {
    expect(await source.discoverKeywords([], "CH")).toEqual([]);
  });
});
