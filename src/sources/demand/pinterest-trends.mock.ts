import type { Country } from "@/config/radar.config";
import type { HashtagClassifier } from "@/matching/hashtag-classifier";
import { MOCK_CATALOG, mockSeries } from "../mock/catalog";
import { createRng } from "../mock/random";
import { PinterestTrendsSourceBase, type PinterestTrend } from "./pinterest-trends";

/** Pinterest zeigt Deko- und Wohntrends in den Demo-Daten eine Woche vor Google */
const PINTEREST_LEAD_WEEKS = 1;
/** Pinterest-Stärken: Wohnen, Deko, Beleuchtung, Beauty, Küche */
const PINTEREST_CATEGORIES = new Set(["beleuchtung", "wohnen-deko", "kueche-haushalt", "beauty-pflege", "haustier"]);
const TRENDING_SHAPES = new Set(["breakout", "early-rise", "steady-growth", "seasonal"]);
/** Typische Pinterest-Trends ohne Produktbezug – zeigen, dass die Klassifizierung filtert */
const NOISE: Record<"de" | "en", string[]> = {
  de: ["herbst deko ideen", "kürbissuppe", "nägel herbst", "hochzeitsfrisur", "zitate liebe"],
  en: ["autumn nails", "pumpkin soup", "wedding hairstyles", "fall outfit ideas", "love quotes"],
};
/** Vertreterland je Pinterest-Region für die Demo-Kurven */
const REGION_COUNTRY: Record<string, Country> = { DE: "DE", "DE+AT+CH": "AT", "GB+IE": "GB" };

export class PinterestTrendsMockSource extends PinterestTrendsSourceBase {
  readonly mode = "mock" as const;

  constructor(
    classifier: HashtagClassifier,
    private readonly now: Date = new Date(),
  ) {
    super(classifier);
  }

  protected async loadTrends(region: string): Promise<PinterestTrend[]> {
    const country = REGION_COUNTRY[region] ?? "DE";
    const language = country === "GB" ? "en" : "de";
    const rng = createRng(`pinterest|${region}|${this.now.toISOString().slice(0, 10)}`);
    const products = MOCK_CATALOG.filter(
      (p) => PINTEREST_CATEGORIES.has(p.category) && TRENDING_SHAPES.has(p.shape.type) && !p.absentIn?.includes(country),
    );
    const productTrends = products.map((product) => ({
      keyword: product.keyword[language],
      series: mockSeries(product, country, this.now, PINTEREST_LEAD_WEEKS),
    }));
    const weekStarts = productTrends[0]?.series.map((p) => p.weekStart) ?? [];
    const noise = NOISE[language].map((keyword) => ({
      keyword,
      series: weekStarts.map((weekStart) => ({ weekStart, value: 20 + Math.round(rng() * 70) })),
    }));
    return [...productTrends, ...noise].map((t) => {
      const recent = t.series.at(-1)?.value ?? 0;
      const monthAgo = Math.max(1, t.series.at(-5)?.value ?? 1);
      const weekAgo = Math.max(1, t.series.at(-2)?.value ?? 1);
      return {
        keyword: t.keyword,
        growthWow: Math.round(((recent - weekAgo) / weekAgo) * 100),
        growthMom: Math.round(((recent - monthAgo) / monthAgo) * 100),
        growthYoy: null,
        series: t.series,
      };
    });
  }
}
