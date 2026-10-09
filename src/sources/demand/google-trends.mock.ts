import type { Country } from "@/config/radar.config";
import { mean } from "@/lib/stats";
import { MOCK_CATALOG, findMockProduct, keywordFor, mockSeries, seedGroupOf } from "../mock/catalog";
import type { DemandRecord, DiscoveredKeyword, TrendSource } from "../types";

/** Entdeckungszeitraum „today 3-m“ ≈ 13 Wochen, verglichen mit den 13 Wochen davor. */
const DISCOVERY_WEEKS = 13;
/** Ab diesem Wachstum zeigt Google „Breakout“ statt einer Prozentzahl. */
const BREAKOUT_PCT = 5000;

/**
 * Wachstum im Stil der Trends-Anzeige („+250 %“ / „Breakout“).
 * null = nicht steigend → Google würde das Keyword nicht unter „rising“ listen.
 */
function risingSignal(values: number[]): string | null {
  const recent = mean(values.slice(-DISCOVERY_WEEKS));
  const before = mean(values.slice(-2 * DISCOVERY_WEEKS, -DISCOVERY_WEEKS));
  if (before < 1) return recent >= 1 ? "Breakout" : null;
  const growthPct = Math.round(((recent - before) / before) * 100);
  if (growthPct <= 0) return null;
  return growthPct > BREAKOUT_PCT ? "Breakout" : `+${growthPct} %`;
}

/** Typische unbrauchbare „rising“-Begriffe aus dem ersten Live-Lauf (09.10.2026) */
const NOISE = {
  de: ["ikea herbst deko", "herbst deko basteln", "wie funktioniert ein luftbefeuchter", "luftbefeuchter test"],
  en: ["ikea fado lamp", "philips hue floor lamp", "how to clean led strip lights", "star wars lamp"],
} as const;

export class GoogleTrendsMockSource implements TrendSource {
  readonly id = "google-trends";
  readonly label = "Google Trends";
  readonly mode = "mock" as const;

  constructor(private readonly now: Date = new Date()) {}

  async discoverKeywords(seeds: string[], country: Country): Promise<DiscoveredKeyword[]> {
    const found = new Map<string, DiscoveredKeyword>();
    for (const seed of seeds) {
      const group = seedGroupOf(seed);
      if (!group) continue;
      for (const product of MOCK_CATALOG) {
        if (!product.seeds.includes(group)) continue;
        const keyword = keywordFor(product, country);
        if (found.has(keyword)) continue;
        const values = mockSeries(product, country, this.now).map((p) => p.value);
        const signal = risingSignal(values);
        if (!signal) continue;
        found.set(keyword, { keyword, seedTerm: seed, signal });
      }
    }
    // Wie im echten Lauf: Google listet unter „rising“ auch Marken, Anleitungen und Tests –
    // der Keyword-Filter muss sie vor den (kostenpflichtigen) Trendkurven aussortieren.
    const seed = seeds[0];
    for (const keyword of seed ? NOISE[country === "GB" ? "en" : "de"] : []) {
      if (!found.has(keyword)) found.set(keyword, { keyword, seedTerm: seed!, signal: "+120 %" });
    }
    return [...found.values()];
  }

  async fetchSeries(keyword: string, seedTerm: string | null, country: Country): Promise<DemandRecord | null> {
    const product = findMockProduct(keyword);
    if (!product) return null;
    const series = mockSeries(product, country, this.now);
    return {
      source: this.id,
      country,
      fetchedAt: new Date(),
      keyword,
      seedTerm,
      series,
      raw: { mock: true, catalogSlug: product.slug, shape: product.shape, lagWeeks: product.lagWeeks?.[country] ?? 0 },
    };
  }
}
