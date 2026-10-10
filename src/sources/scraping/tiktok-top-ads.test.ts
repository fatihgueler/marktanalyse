import { describe, expect, it } from "vitest";
import type { HashtagClassifier } from "@/matching/hashtag-classifier";
import type { DemandRecord, TrendSource } from "../types";
import { adText, landingSlug, parseTopAds, TikTokTopAdsApifySource, type TopAd } from "./tiktok-top-ads";

// Ausschnitt aus dem Testlauf 10/2026 (Region DE)
const ITEMS = [
  { brandName: null, adTitle: "ad the comfiest way #ootd @Birkenstock Europe ☕️", landingPage: null, objective: "Reach", likes: 2767, ctr: 0.47 },
  {
    brandName: "lovids",
    adTitle: "Last day 50% off! Foundation stick matches your tone 💄 #makeup",
    landingPage: "https://www.verdtera.com/products/foundation-stick?utm_source=tiktok",
    objective: "Conversion",
    likes: 36,
    ctr: 0.45,
  },
  { adTitle: "", landingPage: "https://x.de/products/leer" },
];

describe("parseTopAds", () => {
  it("liest die Felder und verwirft Einträge ohne Text", () => {
    const ads = parseTopAds(ITEMS);
    expect(ads).toHaveLength(2);
    expect(ads[1]).toMatchObject({ brand: "lovids", objective: "Conversion", landingPage: expect.stringContaining("/products/") });
  });
});

describe("landingSlug / adText", () => {
  it("nimmt den letzten sprechenden Pfadteil ohne Parameter", () => {
    expect(landingSlug("https://shop.de/products/galaxy-star-projector?utm=1")).toBe("galaxy-star-projector");
    expect(landingSlug("https://shop.de/p/12345")).toBeNull();
    expect(landingSlug(null)).toBeNull();
  });

  it("entfernt Hashtags, Erwähnungen und Emojis und hängt den Shop-Pfad an", () => {
    const ad = parseTopAds(ITEMS)[1]!;
    expect(adText(ad)).toBe("last day 50% off! foundation stick matches your tone | foundation-stick");
  });
});

class FakeSource extends TikTokTopAdsApifySource {
  constructor(classifier: HashtagClassifier, series: TrendSource | null) {
    super("token", classifier, series);
  }
  protected override async loadAds(): Promise<TopAd[]> {
    return parseTopAds(ITEMS);
  }
}

const classifier: HashtagClassifier = {
  mode: "live",
  classify: async (texts) => texts.map((hashtag) => ({ hashtag, keyword: hashtag.includes("foundation") ? "foundation stick" : null })),
};

const googleTrends: TrendSource = {
  id: "google-trends",
  label: "Google Trends",
  mode: "live",
  discoverKeywords: async () => [],
  fetchSeries: async (keyword, seedTerm, country): Promise<DemandRecord> => ({
    source: "google-trends",
    country,
    fetchedAt: new Date(),
    keyword,
    seedTerm,
    series: [{ weekStart: "2026-10-05", value: 50 }],
    raw: { big: "json" },
  }),
};

describe("TikTokTopAdsApifySource", () => {
  it("übernimmt nur Anzeigen mit Shop-Link und holt die Kurve von Google Trends", async () => {
    const source = new FakeSource(classifier, googleTrends);
    const found = await source.discoverKeywords([], "DE");
    expect(found.map((f) => f.keyword)).toEqual(["foundation stick"]);
    const record = await source.fetchSeries("foundation stick", found[0]!.seedTerm, "DE");
    expect(record?.source).toBe("tiktok-trends");
    expect(record?.series).toHaveLength(1);
    expect(record?.raw).toMatchObject({ tiktokAd: { brand: "lovids" } });
  });

  it("läuft nur in den Ländern des Creative Centers und nie ohne Kurvenquelle", async () => {
    expect(await new FakeSource(classifier, googleTrends).discoverKeywords([], "AT")).toEqual([]);
    expect(await new FakeSource(classifier, null).discoverKeywords([], "DE")).toEqual([]);
  });
});
