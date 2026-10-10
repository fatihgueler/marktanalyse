import { z } from "zod";
import { radarConfig, type Country } from "@/config/radar.config";
import { rotateSeeds } from "@/lib/seed-rotation";
import { isoDate } from "@/lib/weeks";
import type { SearchBudget } from "../budget";
import { Throttle, fetchJson } from "../http";
import type { DemandRecord, DiscoveredKeyword, TrendSource } from "../types";

const SERPAPI_URL = "https://serpapi.com/search.json";

// Nur die Felder, die wir nutzen – der Rest bleibt in `raw` erhalten.
const relatedQueriesSchema = z.object({
  related_queries: z
    .object({
      rising: z.array(z.object({ query: z.string(), value: z.union([z.string(), z.number()]).optional() })).optional(),
    })
    .optional(),
});

const trendingNowSchema = z.object({
  trending_searches: z.array(z.object({ query: z.string(), increase_percentage: z.number().nullish() })).optional(),
});

const timeseriesSchema = z.object({
  interest_over_time: z
    .object({
      timeline_data: z.array(
        z.object({
          timestamp: z.string(),
          partial_data: z.boolean().optional(),
          values: z.array(z.object({ query: z.string().optional(), extracted_value: z.number() })),
        }),
      ),
    })
    .optional(),
});

/** Google Trends über SerpApi (engine=google_trends). */
export class GoogleTrendsSerpApiSource implements TrendSource {
  readonly id = "google-trends";
  readonly label = "Google Trends";
  readonly mode = "live" as const;
  private readonly throttle = new Throttle();

  readonly usesSerpApiBudget = true;

  constructor(
    private readonly apiKey: string,
    private readonly budget: SearchBudget,
  ) {}

  private url(params: Record<string, string>): string {
    const search = new URLSearchParams({ engine: "google_trends", api_key: this.apiKey, ...params });
    return `${SERPAPI_URL}?${search.toString()}`;
  }

  /**
   * Steigende Suchanfragen finden – drei Wege, jeder kostet je Abfrage eine SerpApi-Suche:
   * 1. rund um die Seeds (Startbegriffe),
   * 2. je Google-Trends-Kategorie OHNE Startbegriff (`demand.discoveryCategories`, rotierend),
   * 3. Google „Trending Now“ in der Kategorie Shopping (`demand.trendingNow`).
   * Ist das Budget erschöpft, geht es mit den bisher gefundenen Keywords weiter statt abzubrechen.
   */
  async discoverKeywords(seeds: string[], country: Country, now: Date = new Date()): Promise<DiscoveredKeyword[]> {
    const profile = radarConfig.countries[country];
    const { discoveryCategories, maxCategoriesPerCountry, trendingNow, discoveryTimeframe } = radarConfig.demand;
    const found = new Map<string, DiscoveredKeyword>();
    const add = (query: string, seedTerm: string, signal: string) => {
      const keyword = query.trim().toLowerCase();
      if (keyword && !found.has(keyword)) found.set(keyword, { keyword, seedTerm, signal });
    };
    const relatedRising = async (params: Record<string, string>, seedTerm: string) => {
      const json = await fetchJson<unknown>(
        this.url({ geo: profile.serpGeo, hl: profile.serpLanguage, data_type: "RELATED_QUERIES", date: discoveryTimeframe, ...params }),
        {},
        this.throttle,
      );
      for (const item of relatedQueriesSchema.parse(json).related_queries?.rising ?? []) add(item.query, seedTerm, String(item.value ?? ""));
    };

    for (const seed of seeds) {
      if (!this.budget.tryTake()) return [...found.values()];
      await relatedRising({ q: seed }, seed);
    }
    for (const category of rotateSeeds(discoveryCategories, maxCategoriesPerCountry, now)) {
      if (!this.budget.tryTake()) return [...found.values()];
      await relatedRising({ cat: String(category.id) }, `Kategorie ${category.label}`);
    }
    if (trendingNow.enabled && this.budget.tryTake()) {
      const search = new URLSearchParams({
        engine: "google_trends_trending_now",
        api_key: this.apiKey,
        geo: profile.serpGeo,
        hl: profile.serpLanguage,
        hours: String(trendingNow.hours),
        category_id: String(trendingNow.categoryId),
      });
      const json = await fetchJson<unknown>(`${SERPAPI_URL}?${search.toString()}`, {}, this.throttle);
      for (const item of trendingNowSchema.parse(json).trending_searches ?? []) {
        add(item.query, "Google Trending Now (Shopping)", item.increase_percentage ? `+${item.increase_percentage} %` : "Trending");
      }
    }
    return [...found.values()];
  }

  async fetchSeries(keyword: string, seedTerm: string | null, country: Country): Promise<DemandRecord | null> {
    const profile = radarConfig.countries[country];
    this.budget.take();
    const json = await fetchJson<unknown>(
      this.url({
        q: keyword,
        geo: profile.serpGeo,
        hl: profile.serpLanguage,
        data_type: "TIMESERIES",
        date: radarConfig.demand.seriesTimeframe,
      }),
      {},
      this.throttle,
    );
    const parsed = timeseriesSchema.parse(json);
    const timeline = parsed.interest_over_time?.timeline_data ?? [];
    // ANNAHME: Die letzte, noch laufende Woche (partial_data) wird verworfen – sie würde den
    // Anstieg systematisch unterschätzen.
    const series = timeline
      .filter((point) => !point.partial_data)
      .map((point) => ({
        // Google-Wochen beginnen sonntags; wir übernehmen den Wochenbeginn der Quelle unverändert.
        weekStart: isoDate(new Date(Number(point.timestamp) * 1000)),
        value: point.values[0]?.extracted_value ?? 0,
      }));
    if (series.length === 0) return null;

    return { source: this.id, country, fetchedAt: new Date(), keyword, seedTerm, series, raw: json };
  }
}
