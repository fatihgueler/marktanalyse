import { z } from "zod";
import { radarConfig, type Country, type RadarConfig } from "@/config/radar.config";
import { median, round } from "@/lib/stats";
import { Throttle, fetchJson } from "../http";
import type { MarketRecord, MarketSource } from "../types";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const SCOPE = "https://api.ebay.com/oauth/api_scope";
/** Suchbegriffe sind auf 100 Zeichen begrenzt */
const MAX_QUERY = 100;
/** Token 60 s vor Ablauf erneuern */
const TOKEN_SAFETY_MS = 60_000;
/** So viele Angebote landen als Beispiel in den Rohdaten */
const RAW_SAMPLE = 20;

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });

const itemSchema = z.looseObject({
  title: z.string().optional(),
  price: z.object({ value: z.string(), currency: z.string() }).optional(),
  itemLocation: z.looseObject({ country: z.string().optional() }).optional(),
});

const searchSchema = z.looseObject({
  total: z.number().optional(),
  itemSummaries: z.array(z.unknown()).optional(),
});

export interface ListingSample {
  title: string;
  price: number | null;
  currency: string | null;
  /** ISO-Ländercode des Versandorts */
  location: string | null;
}

export function parseListings(items: readonly unknown[]): ListingSample[] {
  return items.flatMap((item) => {
    const parsed = itemSchema.safeParse(item);
    if (!parsed.success) return [];
    const value = parsed.data.price ? Number(parsed.data.price.value) : Number.NaN;
    return [
      {
        title: parsed.data.title ?? "",
        price: Number.isFinite(value) && value > 0 ? value : null,
        currency: parsed.data.price?.currency ?? null,
        location: parsed.data.itemLocation?.country?.toUpperCase() ?? null,
      },
    ];
  });
}

/**
 * Verdichtet eine Stichprobe: Anteil Asien-Direktversand und Median-Preis der übrigen Angebote.
 * ANNAHME: Angebote in fremder Währung (selten) werden ignoriert statt umgerechnet.
 */
export function summarizeListings(
  total: number,
  listings: readonly ListingSample[],
  country: Country,
  config: Pick<RadarConfig, "marketplace" | "countries"> = radarConfig,
): { totalListings: number; asiaShare: number | null; prices: number[]; medianPrice: number | null } {
  const { asiaLocations, minPriceSamples } = config.marketplace;
  const currency = config.countries[country].currency;
  const located = listings.filter((l) => l.location !== null);
  const fromAsia = located.filter((l) => asiaLocations.includes(l.location!));
  const prices = listings
    .filter((l) => !(l.location && asiaLocations.includes(l.location)) && l.currency === currency && l.price !== null)
    .map((l) => l.price!);
  return {
    totalListings: total,
    asiaShare: located.length > 0 ? round(fromAsia.length / located.length, 3) : null,
    prices,
    medianPrice: prices.length >= minPriceSamples ? round(median(prices)) : null,
  };
}

/** Gemeinsamer Aufbau des Datensatzes für Live und Mock. */
export function marketRecord(
  source: string,
  keyword: string,
  country: Country,
  summary: ReturnType<typeof summarizeListings>,
  raw: unknown,
): MarketRecord {
  const fetchedAt = new Date();
  return {
    source,
    country,
    fetchedAt,
    keyword,
    totalListings: summary.totalListings,
    asiaShare: summary.asiaShare,
    price:
      summary.medianPrice === null
        ? null
        : {
            source,
            country,
            fetchedAt,
            keyword,
            medianPrice: summary.medianPrice,
            currency: radarConfig.countries[country].currency,
            sampleSize: summary.prices.length,
            raw: { prices: summary.prices },
          },
    raw,
  };
}

/** eBay Browse API – Neuware zum Festpreis auf dem Marktplatz des Ziellandes. */
export class EbaySource implements MarketSource {
  readonly id = "ebay";
  readonly label = "eBay";
  readonly mode = "live" as const;
  private readonly throttle = new Throttle();
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const json = await fetchJson<unknown>(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }).toString(),
    });
    const parsed = tokenSchema.parse(json);
    this.token = { value: parsed.access_token, expiresAt: Date.now() + parsed.expires_in * 1000 - TOKEN_SAFETY_MS };
    return parsed.access_token;
  }

  async marketActivity(keyword: string, country: Country): Promise<MarketRecord> {
    const params = new URLSearchParams({
      q: keyword.slice(0, MAX_QUERY),
      limit: String(radarConfig.marketplace.sampleSize),
      filter: "buyingOptions:{FIXED_PRICE},conditions:{NEW}",
    });
    const json = await fetchJson<unknown>(
      `${SEARCH_URL}?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${await this.accessToken()}`,
          "X-EBAY-C-MARKETPLACE-ID": radarConfig.countries[country].ebayMarketplace,
        },
      },
      this.throttle,
    );
    const parsed = searchSchema.parse(json);
    const listings = parseListings(parsed.itemSummaries ?? []);
    if ((parsed.itemSummaries?.length ?? 0) > 0 && listings.length === 0) throw new Error("eBay: Antwortformat hat sich geändert");
    const summary = summarizeListings(parsed.total ?? 0, listings, country);
    // Rohdaten ohne Verkäufernamen (können Privatpersonen sein)
    return marketRecord(this.id, keyword, country, summary, { total: parsed.total ?? 0, sample: listings.slice(0, RAW_SAMPLE) });
  }
}
