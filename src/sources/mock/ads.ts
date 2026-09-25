/**
 * Mock-Werbedaten, abgeleitet aus dem Lebenszyklus der Katalogprodukte:
 * gesättigte Produkte haben viele Werbetreibende, Breakouts kaum welche, aber steigend.
 */
import { radarConfig, type Country } from "@/config/radar.config";
import { addWeeks, mondayOf } from "@/lib/weeks";
import { summarizeAds, type RawAd } from "../ads/summarize";
import type { AdRecord } from "../types";
import type { CurveShape, MockProduct } from "./catalog";
import { between, createRng } from "./random";

/** Werbetreibende [min, max) und Verteilung der Startzeitpunkte je Kurvenform */
const PROFILE: Record<CurveShape["type"], { advertisers: [number, number]; recency: "new" | "spread" | "old" | "peaked" }> = {
  breakout: { advertisers: [0, 4], recency: "new" },
  "early-rise": { advertisers: [1, 7], recency: "new" },
  "steady-growth": { advertisers: [8, 22], recency: "spread" },
  seasonal: { advertisers: [6, 18], recency: "spread" },
  "spike-fade": { advertisers: [15, 35], recency: "peaked" },
  declining: { advertisers: [25, 55], recency: "old" },
  flat: { advertisers: [20, 45], recency: "old" },
  "plateau-high": { advertisers: [60, 130], recency: "spread" },
};

const SHOP_PREFIXES = ["Lumo", "Nordic", "Hygge", "Trend", "Casa", "Pixel", "Glow", "Urban", "Nova", "Kiko", "Mira", "Bloom"];
const SHOP_SUFFIXES = ["Home", "Store", "Finds", "Studio", "Living", "Shop", "Goods", "Lab"];

/** Startzeitpunkt einer Anzeige in Wochen vor heute */
function weeksAgo(rng: () => number, recency: (typeof PROFILE)[CurveShape["type"]]["recency"]): number {
  switch (recency) {
    case "new":
      return Math.floor(rng() ** 2 * 6); // fast alle in den letzten Wochen, Häufung ganz vorn
    case "spread":
      return Math.floor(rng() * 40);
    case "old":
      return Math.floor(8 + rng() * 40);
    case "peaked":
      return Math.floor(5 + rng() * 6);
  }
}

export function mockAdActivity(product: MockProduct, keyword: string, country: Country, source: string, platformFactor: number, now: Date): AdRecord {
  const rng = createRng(`ads|${source}|${product.slug}|${country}|${mondayOf(now).toISOString()}`);
  const profile = PROFILE[product.shape.type];
  const absent = product.absentIn?.includes(country) ?? false;
  const advertiserCount = absent ? 0 : Math.round(between(rng, ...profile.advertisers) * platformFactor);

  const ads: RawAd[] = [];
  for (let a = 0; a < advertiserCount; a++) {
    const name = `${SHOP_PREFIXES[Math.floor(rng() * SHOP_PREFIXES.length)]} ${SHOP_SUFFIXES[Math.floor(rng() * SHOP_SUFFIXES.length)]}`;
    const adsOfAdvertiser = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < adsOfAdvertiser; i++) {
      ads.push({ advertiserId: `${source}-${a}`, advertiserName: name, startedAt: addWeeks(now, -weeksAgo(rng, profile.recency)), previewUrl: null });
    }
  }

  const cap = source.startsWith("tiktok") ? radarConfig.ads.maxAdsPerKeyword.tiktok : radarConfig.ads.maxAdsPerKeyword.meta;
  return summarizeAds({
    source,
    keyword,
    country,
    ads: ads.slice(0, cap),
    capped: ads.length > cap,
    raw: { mock: true, catalogSlug: product.slug, generatedAds: ads.length },
    now,
  });
}
