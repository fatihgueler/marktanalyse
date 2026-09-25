import { z } from "zod";
import { radarConfig, type Country } from "@/config/radar.config";
import { median, round } from "@/lib/stats";
import type { SearchBudget } from "../budget";
import { Throttle, fetchJson } from "../http";
import type { PriceRecord, PriceSource } from "../types";

const SERPAPI_URL = "https://serpapi.com/search.json";

const shoppingSchema = z.object({
  shopping_results: z
    .array(z.object({ title: z.string().optional(), extracted_price: z.number().optional(), source: z.string().optional() }))
    .optional(),
});

/** Referenz-Verkaufspreis aus Google Shopping über SerpApi (engine=google_shopping). */
export class GoogleShoppingSerpApiSource implements PriceSource {
  readonly id = "google-shopping";
  readonly label = "Google Shopping";
  readonly maxLookupsPerCountry = radarConfig.referencePrice.maxLookupsPerCountry;
  readonly mode = "live" as const;
  private readonly throttle = new Throttle();

  constructor(
    private readonly apiKey: string,
    private readonly budget: SearchBudget,
  ) {}

  async referencePrice(keyword: string, country: Country): Promise<PriceRecord | null> {
    // Budget erschöpft → kein echter Preis, der Kategorie-Faktor greift (wie bei zu wenigen Treffern)
    if (!this.budget.tryTake()) return null;
    const profile = radarConfig.countries[country];
    const search = new URLSearchParams({
      engine: "google_shopping",
      q: keyword,
      gl: profile.serpGeo.toLowerCase(),
      hl: profile.serpLanguage,
      api_key: this.apiKey,
    });
    const json = await fetchJson<unknown>(`${SERPAPI_URL}?${search.toString()}`, {}, this.throttle);
    const parsed = shoppingSchema.parse(json);
    // ANNAHME: Google Shopping liefert Preise in der Landeswährung des `gl`-Landes (brutto).
    // Der Median der Top-Treffer dämpft Zubehör- und Premium-Ausreißer.
    const prices = (parsed.shopping_results ?? [])
      .slice(0, radarConfig.referencePrice.maxResults)
      .map((r) => r.extracted_price)
      .filter((p): p is number => typeof p === "number" && p > 0);
    if (prices.length < radarConfig.referencePrice.minSampleSize) return null;

    return {
      source: this.id,
      country,
      fetchedAt: new Date(),
      keyword,
      medianPrice: round(median(prices)),
      currency: profile.currency,
      sampleSize: prices.length,
      raw: { prices, results: parsed.shopping_results?.slice(0, radarConfig.referencePrice.maxResults) },
    };
  }
}
