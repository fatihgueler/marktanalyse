import { radarConfig, type Country } from "@/config/radar.config";
import { median, round } from "@/lib/stats";
import { findMockProduct } from "../mock/catalog";
import { between, createRng } from "../mock/random";
import type { PriceRecord, PriceSource } from "../types";

/** Preisniveau je Land relativ zu DE (Schweiz teurer). Nur für Demo-Daten. */
const MOCK_PRICE_LEVEL: Record<Country, number> = { DE: 1, AT: 1.03, CH: 1.25, GB: 0.97 };
const MOCK_SAMPLE_SIZE = 12;

export class GoogleShoppingMockSource implements PriceSource {
  readonly id = "google-shopping";
  readonly label = "Google Shopping";
  readonly maxLookupsPerCountry = radarConfig.referencePrice.maxLookupsPerCountry;
  readonly mode = "mock" as const;

  async referencePrice(keyword: string, country: Country): Promise<PriceRecord | null> {
    const product = findMockProduct(keyword);
    // Unbekannte Keywords: keine Shopping-Treffer → Multiplikator-Fallback greift (wie live bei 0 Treffern).
    if (!product) return null;

    const currency = radarConfig.countries[country].currency;
    const rng = createRng(`price|${keyword}|${country}`);
    const center = product.retailPriceEur * radarConfig.fx[currency] * MOCK_PRICE_LEVEL[country];
    const prices = Array.from({ length: MOCK_SAMPLE_SIZE }, () => round(center * between(rng, 0.7, 1.4)));

    return {
      source: this.id,
      country,
      fetchedAt: new Date(),
      keyword,
      medianPrice: round(median(prices)),
      currency,
      sampleSize: prices.length,
      raw: { mock: true, catalogSlug: product.slug, prices },
    };
  }
}
