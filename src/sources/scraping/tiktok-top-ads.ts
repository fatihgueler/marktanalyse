import { z } from "zod";
import { radarConfig, type Country } from "@/config/radar.config";
import type { HashtagClassifier } from "@/matching/hashtag-classifier";
import { Throttle } from "../http";
import type { DemandRecord, DiscoveredKeyword, TrendSource } from "../types";
import { runApifyActor } from "./apify";

/** Normalisierte Top-Anzeige aus dem TikTok Creative Center – ohne Video-Links (laufen ab, nicht nötig). */
export interface TopAd {
  title: string;
  brand: string | null;
  landingPage: string | null;
  objective: string | null;
  likes: number | null;
  ctr: number | null;
  detailsUrl: string | null;
}

const itemSchema = z
  .object({
    adTitle: z.string().nullish(),
    brandName: z.string().nullish(),
    landingPage: z.string().nullish(),
    objective: z.string().nullish(),
    likes: z.number().nullish(),
    ctr: z.number().nullish(),
    detailsUrl: z.string().nullish(),
  })
  .passthrough();

/** Liest Actor-Ausgaben tolerant (Feldnamen laut Testlauf 10/2026); Einträge ohne Text fallen weg. */
export function parseTopAds(items: unknown[]): TopAd[] {
  return items.flatMap((item) => {
    const parsed = itemSchema.safeParse(item);
    if (!parsed.success || !parsed.data.adTitle?.trim()) return [];
    const d = parsed.data;
    return [
      {
        title: d.adTitle!.trim(),
        brand: d.brandName?.trim() || null,
        landingPage: d.landingPage?.trim() || null,
        objective: d.objective ?? null,
        likes: d.likes ?? null,
        ctr: d.ctr ?? null,
        detailsUrl: d.detailsUrl ?? null,
      },
    ];
  });
}

/** Letzter sprechender Pfadteil der Shop-Seite, z. B. „…/products/galaxy-star-projector?utm=…“ → „galaxy-star-projector“. */
export function landingSlug(url: string | null): string | null {
  if (!url) return null;
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const slug = parts.at(-1);
    if (!slug || /^\d+$/.test(slug) || slug.length < 4) return null;
    return decodeURIComponent(slug).replace(/\.html?$/, "");
  } catch {
    return null;
  }
}

/** Anzeigentext für Claude: ohne Hashtags, Emojis und @-Erwähnungen, gekürzt, plus Pfad der Shop-Seite. */
export function adText(ad: TopAd): string {
  const title = ad.title
    .replace(/[#@][\p{L}\p{N}_]+/gu, " ")
    .replace(/[^\p{L}\p{N}%€$.,!?'’ -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  const slug = landingSlug(ad.landingPage);
  return (slug ? `${title} | ${slug}` : title).toLowerCase();
}

/**
 * TikTok Creative Center, Top-Anzeigen (über Apify). Liefert Suchbegriffe für Produkte, die gerade mit
 * Shop-Link beworben werden; die Trendkurve je Begriff kommt von Google Trends (`seriesSource`), damit
 * alle Keywords nach derselben Regel bewertet werden. Ohne Google-Trends-Quelle entsteht keine Kurve.
 *
 * Behält die Quellen-ID „tiktok-trends“ (Dashboard, Kalibrierung und Demo-Quelle bleiben gleich).
 */
export class TikTokTopAdsApifySource implements TrendSource {
  readonly id = "tiktok-trends";
  readonly label = "TikTok Creative Center (Top-Anzeigen)";
  readonly mode = "live" as const;
  readonly usesSerpApiBudget = true;
  readonly maxKeywordsPerCountry = radarConfig.scraping.tiktokTopAds.maxKeywordsPerCountry;
  private readonly throttle = new Throttle();
  private readonly found = new Map<string, TopAd>();

  constructor(
    private readonly token: string,
    private readonly classifier: HashtagClassifier,
    private readonly seriesSource: TrendSource | null,
  ) {}

  protected async loadAds(country: Country): Promise<TopAd[]> {
    const config = radarConfig.scraping.tiktokTopAds;
    const items = await runApifyActor(
      this.token,
      config.actorId,
      { mode: "topAds", region: country, period: config.periodDays, maxItems: config.adsPerCountry, fetchAdDetails: true },
      { maxItems: config.adsPerCountry, maxChargeUsd: config.maxChargeUsd, throttle: this.throttle },
    );
    const ads = parseTopAds(items);
    if (items.length > 0 && ads.length === 0) throw new Error("TikTok-Top-Anzeigen: Ausgabeformat hat sich geändert (keine lesbaren Einträge).");
    return ads;
  }

  /** Seeds spielen keine Rolle – das Creative Center liefert die Top-Anzeigen je Land direkt. */
  async discoverKeywords(_seeds: string[], country: Country): Promise<DiscoveredKeyword[]> {
    const config = radarConfig.scraping.tiktokTopAds;
    if (!config.countries.includes(country) || !this.seriesSource) return [];
    const ads = (await this.loadAds(country)).filter((ad) => !config.requireLandingPage || ad.landingPage);
    // Gleicher Text (dieselbe Anzeige in mehreren Varianten) nur einmal an Claude
    const byText = new Map<string, TopAd>();
    for (const ad of ads) if (!byText.has(adText(ad))) byText.set(adText(ad), ad);
    const texts = [...byText.keys()];
    const verdicts = await this.classifier.classify(texts, country, "tiktok-ad");

    const discovered: DiscoveredKeyword[] = [];
    for (const verdict of verdicts) {
      const ad = byText.get(verdict.hashtag);
      if (!ad || !verdict.keyword) continue;
      const key = `${country}|${verdict.keyword}`;
      if (this.found.has(key)) continue;
      this.found.set(key, ad);
      discovered.push({ keyword: verdict.keyword, seedTerm: `TikTok-Anzeige: ${ad.title.slice(0, 60)}`, signal: ad.brand ?? "Top-Anzeige" });
    }
    return discovered;
  }

  async fetchSeries(keyword: string, seedTerm: string | null, country: Country): Promise<DemandRecord | null> {
    const ad = this.found.get(`${country}|${keyword}`);
    if (!ad || !this.seriesSource) return null;
    const record = await this.seriesSource.fetchSeries(keyword, seedTerm, country);
    if (!record) return null;
    return {
      ...record,
      source: this.id,
      raw: { tiktokAd: ad, series: { source: record.source } },
    };
  }
}
