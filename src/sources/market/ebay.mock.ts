import { radarConfig, type Country } from "@/config/radar.config";
import { round } from "@/lib/stats";
import { findMockProduct, type CurveShape } from "../mock/catalog";
import { between, createRng } from "../mock/random";
import type { MarketRecord, MarketSource } from "../types";
import { marketRecord, summarizeListings, type ListingSample } from "./ebay";

/**
 * Nur für Demo-Daten: Wie verbreitet ein Produkt auf eBay schon ist, hängt von seiner Lebensphase ab.
 * Frühe Trends haben wenige Angebote, fast alle mit Direktversand aus China.
 */
const PHASE: Record<CurveShape["type"], { listingsFactor: number; asiaShare: number }> = {
  breakout: { listingsFactor: 0.004, asiaShare: 0.85 },
  "early-rise": { listingsFactor: 0.008, asiaShare: 0.8 },
  "spike-fade": { listingsFactor: 0.03, asiaShare: 0.7 },
  "steady-growth": { listingsFactor: 0.05, asiaShare: 0.55 },
  seasonal: { listingsFactor: 0.06, asiaShare: 0.45 },
  flat: { listingsFactor: 0.02, asiaShare: 0.5 },
  declining: { listingsFactor: 0.15, asiaShare: 0.4 },
  "plateau-high": { listingsFactor: 0.2, asiaShare: 0.35 },
};
const MOCK_PRICE_LEVEL: Record<Country, number> = { DE: 0.95, AT: 0.98, CH: 1.2, GB: 0.93 };
const SAMPLE = 40;

export class EbayMockSource implements MarketSource {
  readonly id = "ebay";
  readonly label = "eBay";
  readonly mode = "mock" as const;

  async marketActivity(keyword: string, country: Country): Promise<MarketRecord> {
    const product = findMockProduct(keyword);
    const rng = createRng(`ebay|${keyword}|${country}`);
    const currency = radarConfig.countries[country].currency;
    const phase = product ? PHASE[product.shape.type] : { listingsFactor: 0.05, asiaShare: 0.6 };
    const total = Math.round((product?.resultCount ?? between(rng, 2_000, 60_000)) * phase.listingsFactor * between(rng, 0.8, 1.2));
    // Unbekannte Keywords: nur die Angebotszahl, keine brauchbaren Preise (wie live bei unklaren Treffern)
    const center = product ? product.retailPriceEur * radarConfig.fx[currency] * MOCK_PRICE_LEVEL[country] : null;
    const listings: ListingSample[] = Array.from({ length: Math.min(SAMPLE, total) }, (_, i) => {
      const asia = rng() < phase.asiaShare;
      const price = center === null ? null : round(center * (asia ? between(rng, 0.35, 0.6) : between(rng, 0.8, 1.3)));
      return { title: `${keyword} ${i + 1}`, price, currency, location: asia ? "CN" : country };
    });
    const summary = summarizeListings(total, listings, country);
    return marketRecord(this.id, keyword, country, summary, { mock: true, total, catalogSlug: product?.slug ?? null });
  }
}
