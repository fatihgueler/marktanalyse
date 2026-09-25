import { z } from "zod";
import { radarConfig, type Country } from "@/config/radar.config";
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

  constructor(
    private readonly apiKey: string,
    private readonly budget: SearchBudget,
  ) {}

  private url(params: Record<string, string>): string {
    const search = new URLSearchParams({ engine: "google_trends", api_key: this.apiKey, ...params });
    return `${SERPAPI_URL}?${search.toString()}`;
  }

  async discoverKeywords(seeds: string[], country: Country): Promise<DiscoveredKeyword[]> {
    const profile = radarConfig.countries[country];
    const found = new Map<string, DiscoveredKeyword>();
    for (const seed of seeds) {
      // Budget erschöpft: mit den bisher gefundenen Keywords weiterarbeiten statt abzubrechen
      if (!this.budget.tryTake()) break;
      const json = await fetchJson<unknown>(
        this.url({
          q: seed,
          geo: profile.serpGeo,
          hl: profile.serpLanguage,
          data_type: "RELATED_QUERIES",
          date: radarConfig.demand.discoveryTimeframe,
        }),
        {},
        this.throttle,
      );
      const parsed = relatedQueriesSchema.parse(json);
      for (const item of parsed.related_queries?.rising ?? []) {
        const keyword = item.query.trim().toLowerCase();
        if (!found.has(keyword)) {
          found.set(keyword, { keyword, seedTerm: seed, signal: String(item.value ?? "") });
        }
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
