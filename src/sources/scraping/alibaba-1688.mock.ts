import { radarConfig, type Country } from "@/config/radar.config";
import { findMockProduct } from "../mock/catalog";
import { between, createRng, hashString } from "../mock/random";
import type { SupplyRecord, SupplySource } from "../types";

/** Großhandelspreis relativ zum AliExpress-Preis (nur Demo-Daten) */
const WHOLESALE_DISCOUNT = 0.55;
/** Staffeln als Faktor auf den Basispreis (nur Demo-Daten) */
const TIER_FACTORS = [
  { minQty: 1, factor: 1 },
  { minQty: 50, factor: 0.9 },
  { minQty: 200, factor: 0.82 },
  { minQty: 1000, factor: 0.74 },
];

export class Alibaba1688MockSource implements SupplySource {
  readonly id = "alibaba-1688";
  readonly label = "1688";
  readonly maxSearchesPerCountry = radarConfig.scraping.alibaba1688.maxSearchesPerCountry;
  readonly mode = "mock" as const;

  async search(keyword: string, shipTo: Country, limit: number): Promise<SupplyRecord[]> {
    if (!radarConfig.wholesale.countries.includes(shipTo)) return [];
    const product = findMockProduct(keyword);
    if (!product) return [];
    const rng = createRng(`1688|${keyword}|${shipTo}`);
    const fetchedAt = new Date();
    // Nur echte Treffer plus ein Köder – 1688-Titel sind in den Demo-Daten englisch, live chinesisch.
    const titles = [...product.titles.slice(0, 3).map((t) => `Factory Wholesale ${t}`), ...product.decoys.slice(0, 1)];
    return titles.slice(0, limit).map((title, rank) => {
      const externalId = String(600_000_000_000 + (hashString(`${product.slug}|1688|${title}`) % 99_999_999_999));
      const base = Math.round(product.supplierPriceEur * WHOLESALE_DISCOUNT * radarConfig.fx.CNY * between(rng, 0.85, 1.2) * 100) / 100;
      return {
        source: this.id,
        country: shipTo,
        fetchedAt,
        externalId,
        keyword,
        title,
        url: `https://detail.1688.com/offer/${externalId}.html`,
        imageUrl: null,
        price: base,
        currency: "CNY",
        shippingCost: null,
        orders30d: Math.round(product.topOrders30d * 2 * 0.6 ** rank * between(rng, 0.7, 1.3)),
        rating: null,
        resultCount: null,
        sourcingModel: "wholesale" as const,
        priceTiers: TIER_FACTORS.map((t) => ({ minQty: t.minQty, price: Math.round(base * t.factor * 100) / 100 })),
        moq: Math.round(between(rng, 2, 60)),
        weightKg: null,
        raw: { mock: true, catalogSlug: product.slug, rank },
      };
    });
  }
}
