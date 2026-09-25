import { z } from "zod";
import { radarConfig, type Country } from "@/config/radar.config";
import type { HashtagClassifier } from "@/matching/hashtag-classifier";
import { Throttle } from "../http";
import type { DemandRecord, DiscoveredKeyword, TrendSource } from "../types";
import { runApifyActor } from "./apify";
import { curveToWeeklySeries, type CurvePoint } from "./curve";

/** Normalisierter Trend-Hashtag – ohne Creator-Daten (personenbezogen, werden nicht gespeichert). */
export interface HashtagTrend {
  hashtag: string;
  rank: number | null;
  views: number | null;
  posts: number | null;
  curve: CurvePoint[];
}

const itemSchema = z
  .object({
    hashtagName: z.string(),
    rank: z.number().nullish(),
    views: z.number().nullish(),
    publishCount: z.number().nullish(),
    popularityCurve: z.array(z.object({ timestamp: z.number(), value: z.number() })).nullish(),
  })
  .passthrough();

/** Liest Actor-Ausgaben tolerant; Einträge mit unerwarteter Struktur werden übersprungen. */
export function parseHashtagItems(items: unknown[]): HashtagTrend[] {
  return items.flatMap((item) => {
    const parsed = itemSchema.safeParse(item);
    if (!parsed.success) return [];
    // ANNAHME: Feldnamen laut Beispielausgabe des Actors memo23~tiktok-trending-hashtags-scraper
    return [
      {
        hashtag: parsed.data.hashtagName.toLowerCase(),
        rank: parsed.data.rank ?? null,
        views: parsed.data.views ?? null,
        posts: parsed.data.publishCount ?? null,
        curve: parsed.data.popularityCurve ?? [],
      },
    ];
  });
}

/**
 * Gemeinsame Logik für Live und Mock: Trend-Hashtags je Land holen, Produkt-Hashtags per
 * Klassifizierer herausfiltern und die Kurven für `fetchSeries` zwischenspeichern.
 */
export abstract class TikTokHashtagSourceBase implements TrendSource {
  readonly id = "tiktok-trends";
  readonly label = "TikTok Creative Center";
  abstract readonly mode: "live" | "mock";
  private readonly found = new Map<string, { trend: HashtagTrend; keyword: string }>();

  constructor(
    protected readonly classifier: HashtagClassifier,
    protected readonly now: Date = new Date(),
  ) {}

  protected abstract loadHashtags(country: Country): Promise<HashtagTrend[]>;

  /** Seeds spielen hier keine Rolle – das Creative Center liefert die Trends je Land direkt. */
  async discoverKeywords(_seeds: string[], country: Country): Promise<DiscoveredKeyword[]> {
    const config = radarConfig.scraping.tiktokHashtags;
    if (!config.countries.includes(country)) return [];
    const trends = (await this.loadHashtags(country)).filter((t) => !config.ignore.includes(t.hashtag));
    const verdicts = await this.classifier.classify(
      trends.map((t) => t.hashtag),
      country,
    );
    const discovered: DiscoveredKeyword[] = [];
    for (const [index, verdict] of verdicts.entries()) {
      const trend = trends[index];
      if (!trend || !verdict.keyword) continue;
      const key = `${country}|${verdict.keyword}`;
      if (this.found.has(key)) continue;
      this.found.set(key, { trend, keyword: verdict.keyword });
      discovered.push({ keyword: verdict.keyword, seedTerm: `#${trend.hashtag}`, signal: trend.rank ? `Rang ${trend.rank}` : "Trend" });
    }
    return discovered;
  }

  async fetchSeries(keyword: string, seedTerm: string | null, country: Country): Promise<DemandRecord | null> {
    const entry = this.found.get(`${country}|${keyword}`);
    if (!entry) return null;
    return {
      source: this.id,
      country,
      fetchedAt: new Date(),
      keyword,
      seedTerm,
      series: curveToWeeklySeries(entry.trend.curve, this.now),
      // Rohdaten ohne Creator-Namen (Datensparsamkeit)
      raw: { hashtag: entry.trend.hashtag, rank: entry.trend.rank, views: entry.trend.views, posts: entry.trend.posts, mode: this.mode },
    };
  }
}

/** Live: TikTok Creative Center über Apify-Actor (Scraping, siehe README „Scraping“). */
export class TikTokHashtagsApifySource extends TikTokHashtagSourceBase {
  readonly mode = "live" as const;
  private readonly throttle = new Throttle();

  constructor(
    private readonly token: string,
    classifier: HashtagClassifier,
  ) {
    super(classifier);
  }

  protected async loadHashtags(country: Country): Promise<HashtagTrend[]> {
    const config = radarConfig.scraping.tiktokHashtags;
    const items = await runApifyActor(
      this.token,
      config.actorId,
      { country, days: config.days, resultsLimit: config.hashtagsPerCountry },
      { maxItems: config.hashtagsPerCountry, maxChargeUsd: config.maxChargeUsd, throttle: this.throttle },
    );
    const trends = parseHashtagItems(items);
    if (items.length > 0 && trends.length === 0) throw new Error("TikTok-Actor: Ausgabeformat hat sich geändert (keine lesbaren Einträge).");
    return trends;
  }
}
