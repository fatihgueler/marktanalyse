import { findMockProduct } from "../mock/catalog";
import { radarConfig, type Country } from "@/config/radar.config";
import { between, createRng, hashString } from "../mock/random";
import type { SupplyRecord, SupplySource } from "../types";

/** Stabile, AliExpress-ähnliche Produkt-ID (16 Stellen) – gleich über Länder und Läufe. */
function mockProductId(key: string): string {
  return `1005${String(hashString(key)).padStart(10, "0")}`.slice(0, 16).padEnd(16, "7");
}

function capitalize(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Liefert Angebote aus dem Mock-Katalog; unbekannte Keywords bekommen generische, deterministische Treffer. */
export class AliExpressMockSource implements SupplySource {
  readonly id = "aliexpress";
  readonly label = "AliExpress";
  readonly mode = "mock" as const;

  async search(keyword: string, shipTo: Country, limit: number): Promise<SupplyRecord[]> {
    const product = findMockProduct(keyword);
    const rng = createRng(`supply|${keyword}|${shipTo}`);
    const fetchedAt = new Date();

    const basePrice = product?.supplierPriceEur ?? Math.round(between(rng, 3, 25) * 100) / 100;
    const topOrders = product?.topOrders30d ?? Math.round(between(rng, 100, 20000));
    const resultCount = product?.resultCount ?? Math.round(between(rng, 500, 60000));
    const titles = product
      ? [...product.titles, ...product.decoys]
      : [`${capitalize(keyword)} Portable Mini`, `${capitalize(keyword)} Upgraded Version 2026`, `${capitalize(keyword)} Accessory Set`];
    const slug = product?.slug ?? keyword;

    return titles.slice(0, limit).map((title, rank) => {
      const isDecoy = product ? rank >= product.titles.length : false;
      const externalId = mockProductId(`${slug}|${title}`);
      const price = Math.round(basePrice * (isDecoy ? between(rng, 0.3, 0.8) : between(rng, 0.85, 1.35)) * 100) / 100;
      // Wie live: Versand nur für die ersten Treffer; ein Teil ist kostenlos (Choice), ein Teil sehr langsam.
      const quoted = rank < radarConfig.supply.shippingLookupsPerSearch;
      const fee = rng() < 0.35 ? 0 : Math.round(between(rng, 0.9, 4.5) * 100) / 100;
      const minDays = Math.round(between(rng, 6, 16));
      const maxDays = minDays + Math.round(between(rng, 3, 12));
      return {
        source: this.id,
        country: shipTo,
        fetchedAt,
        externalId,
        keyword,
        title,
        // Demo: keine erfundene Artikelseite (wäre ein 404), sondern die echte Suche nach dem Keyword
        url: `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(keyword)}`,
        imageUrl: null,
        price,
        currency: "EUR",
        shippingCost: quoted ? fee : null,
        delivery: quoted ? { minDays, maxDays, shipFrom: "CN" } : null,
        orders30d: Math.round(topOrders * 0.6 ** rank * between(rng, 0.8, 1.2)),
        rating: Math.round(between(rng, 88, 99) * 10) / 10,
        resultCount,
        raw: { mock: true, catalogSlug: product?.slug ?? null, rank },
      };
    });
  }
}
