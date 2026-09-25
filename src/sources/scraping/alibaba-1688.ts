import { radarConfig, type Country } from "@/config/radar.config";
import type { ClaudeKeywordTranslator } from "@/matching/keyword-translator";
import { Throttle } from "../http";
import type { PriceTier, SupplyRecord, SupplySource } from "../types";
import { runApifyActor } from "./apify";

type Item = Record<string, unknown>;

/** Erste gefundene Eigenschaft aus einer Liste möglicher Feldnamen – Actor-Ausgaben variieren. */
function pick(item: Item, keys: string[]): unknown {
  for (const key of keys) if (item[key] !== undefined && item[key] !== null && item[key] !== "") return item[key];
  return undefined;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const match = value.replace(",", ".").match(/\d+(\.\d+)?/);
    return match ? Number(match[0]) : null;
  }
  return null;
}

/**
 * Staffelpreise aus der Actor-Ausgabe, z. B. [{ range: "1~9个", price: 6.7 }, { range: "≥150个", price: 5.7 }]
 * oder [{ quantity: 150, price: "5.70" }]. Die Mindestmenge ist die erste Zahl der Mengenangabe.
 */
export function parsePriceTiers(value: unknown): PriceTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((tier) => {
      if (typeof tier !== "object" || tier === null) return [];
      const t = tier as Item;
      const minQty = toNumber(pick(t, ["minQty", "quantity", "beginAmount", "startQuantity", "range", "qty"]));
      const price = toNumber(pick(t, ["price", "value"]));
      return minQty !== null && price !== null && price > 0 ? [{ minQty: Math.max(1, Math.floor(minQty)), price }] : [];
    })
    .sort((a, b) => a.minQty - b.minQty);
}

/**
 * Normalisiert einen 1688-Eintrag. ANNAHME: Feldnamen nach Beschreibung des Actors
 * songd~1688-search-scraper (offerId, title, price, price_tiers, sales, url, image); da die
 * Ausgabe nicht live geprüft werden konnte, werden gängige Alternativen mitgelesen.
 */
export function normalize1688Item(item: Item, keyword: string, country: Country, fetchedAt: Date): SupplyRecord | null {
  const id = pick(item, ["offerId", "offer_id", "item_id", "id"]);
  const title = pick(item, ["title", "subject", "simple_subject", "name"]);
  const price = toNumber(pick(item, ["price", "min_price", "priceMin"]));
  if (id === undefined || typeof title !== "string" || price === null) return null;
  const externalId = String(id);
  const url = pick(item, ["url", "detail_url", "od_url", "offer_url", "link"]);
  const image = pick(item, ["image", "img_url", "image_url", "imageUrl", "main_image"]);
  const tiers = parsePriceTiers(pick(item, ["price_tiers", "priceTiers", "price_ranges", "priceRanges"]));
  const moq = toNumber(pick(item, ["moq", "min_order", "quantityBegin", "minOrderQuantity"]));
  const weight = toNumber(pick(item, ["weight", "unit_weight", "weightKg"]));
  return {
    source: "alibaba-1688",
    country,
    fetchedAt,
    externalId,
    keyword,
    title,
    url: typeof url === "string" ? url : `https://detail.1688.com/offer/${encodeURIComponent(externalId)}.html`,
    imageUrl: typeof image === "string" ? image : null,
    price,
    currency: "CNY",
    shippingCost: null,
    // ANNAHME: `sales` ist das Verkaufsvolumen der letzten Zeit laut 1688-Anzeige, nicht exakt 30 Tage
    orders30d: toNumber(pick(item, ["sales", "sale_volume", "salesVolume", "sold"])),
    rating: null,
    resultCount: null,
    sourcingModel: "wholesale",
    priceTiers: tiers,
    moq: moq === null ? null : Math.floor(moq),
    weightKg: weight,
    raw: item,
  };
}

/** Live: 1688-Suche über Apify-Actor (Scraping, siehe README „Scraping“). */
export class Alibaba1688ApifySource implements SupplySource {
  readonly id = "alibaba-1688";
  readonly label = "1688";
  readonly mode = "live" as const;
  private readonly throttle = new Throttle();

  constructor(
    private readonly token: string,
    private readonly translator: ClaudeKeywordTranslator | null,
  ) {}

  async search(keyword: string, shipTo: Country, limit: number): Promise<SupplyRecord[]> {
    if (!radarConfig.wholesale.countries.includes(shipTo)) return [];
    if (!this.translator) throw new Error("1688 übersprungen: Die Übersetzung ins Chinesische braucht ANTHROPIC_API_KEY.");
    const config = radarConfig.scraping.alibaba1688;
    const keywordZh = await this.translator.toChinese(keyword);
    const items = await runApifyActor<Item>(
      this.token,
      config.actorId,
      { keyword: keywordZh, maxPages: config.maxPages, sortType: "va_sales360", descendOrder: true },
      { maxItems: config.resultsPerKeyword, maxChargeUsd: config.maxChargeUsd, throttle: this.throttle },
    );
    const fetchedAt = new Date();
    const records = items.flatMap((item) => {
      const record = typeof item === "object" && item !== null ? normalize1688Item(item, keyword, shipTo, fetchedAt) : null;
      return record ? [{ ...record, raw: { ...record.raw as object, searchKeywordZh: keywordZh } }] : [];
    });
    if (items.length > 0 && records.length === 0) throw new Error("1688-Actor: Ausgabeformat hat sich geändert (keine lesbaren Einträge).");
    return records.slice(0, Math.min(limit, config.resultsPerKeyword));
  }
}
