import { z } from "zod";
import { radarConfig, type Country } from "@/config/radar.config";
import { HttpError, Throttle, fetchJson } from "../http";
import type { AdRecord, AdSignalSource } from "../types";
import { isCovered, notCovered, summarizeAds, type RawAd } from "./summarize";

const PAGE_SIZE = 50;

const pageSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      page_id: z.string().optional(),
      page_name: z.string().optional(),
      ad_delivery_start_time: z.string().optional(),
    }),
  ),
  paging: z.object({ next: z.string().optional() }).optional(),
});

/** Öffentlicher Link zur Anzeige. Bewusst NICHT `ad_snapshot_url` – der enthält den Access Token. */
function publicAdUrl(adId: string): string {
  return `https://www.facebook.com/ads/library/?id=${encodeURIComponent(adId)}`;
}

/** Fehlermeldung der Graph API lesbar machen (v. a. abgelaufener Token, Code 190). */
function describeGraphError(error: unknown): string {
  if (error instanceof HttpError && error.body) {
    try {
      const body = JSON.parse(error.body) as { error?: { message?: string; code?: number } };
      if (body.error?.code === 190) return "Meta-Token abgelaufen oder ungültig – META_ACCESS_TOKEN erneuern (siehe README).";
      if (body.error?.message) return `Meta Ad Library: ${body.error.message}`;
    } catch {
      // Body war kein JSON – ursprüngliche Meldung verwenden
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Meta Ad Library API (Graph API `ads_archive`). Nicht-politische Anzeigen nur für die EU. */
export class MetaAdLibrarySource implements AdSignalSource {
  readonly id = "meta-ad-library";
  readonly label = "Meta Ad Library";
  readonly mode = "live" as const;
  private readonly throttle = new Throttle();

  constructor(private readonly accessToken: string) {}

  async adActivity(keyword: string, country: Country): Promise<AdRecord> {
    if (!isCovered(country)) return notCovered(this.id, keyword, country);
    const { metaGraphVersion } = radarConfig.ads;
    const maxAdsPerKeyword = radarConfig.ads.maxAdsPerKeyword.meta;

    const params = new URLSearchParams({
      search_terms: keyword,
      search_type: "KEYWORD_EXACT_PHRASE",
      ad_type: "ALL",
      ad_active_status: "ACTIVE",
      ad_reached_countries: JSON.stringify([country]),
      fields: "id,page_id,page_name,ad_delivery_start_time",
      limit: String(PAGE_SIZE),
      access_token: this.accessToken,
    });
    let url: string | undefined = `https://graph.facebook.com/${metaGraphVersion}/ads_archive?${params.toString()}`;

    const ads: RawAd[] = [];
    let capped = false;
    try {
      while (url) {
        const page = pageSchema.parse(await fetchJson<unknown>(url, {}, this.throttle));
        for (const ad of page.data) {
          if (!ad.ad_delivery_start_time) continue;
          ads.push({
            advertiserId: ad.page_id ?? ad.id,
            advertiserName: ad.page_name ?? "unbekannt",
            startedAt: new Date(ad.ad_delivery_start_time),
            previewUrl: publicAdUrl(ad.id),
          });
        }
        if (ads.length >= maxAdsPerKeyword) {
          capped = Boolean(page.paging?.next) || ads.length > maxAdsPerKeyword;
          break;
        }
        url = page.paging?.next;
      }
    } catch (error) {
      throw new Error(describeGraphError(error));
    }

    // Rohdaten ohne Paging-Links speichern – diese enthalten den Access Token.
    const kept = ads.slice(0, maxAdsPerKeyword);
    return summarizeAds({
      source: this.id,
      keyword,
      country,
      ads: kept,
      capped,
      raw: { ads: kept.map((a) => ({ page: a.advertiserName, start: a.startedAt.toISOString(), url: a.previewUrl })) },
    });
  }
}

/**
 * Prüft, wann der Meta-Token abläuft (Graph API `debug_token`, braucht App-ID und -Secret).
 * Liefert die verbleibenden Tage oder null, wenn der Token nicht abläuft.
 */
export async function metaTokenDaysLeft(accessToken: string, appId: string, appSecret: string): Promise<number | null> {
  const params = new URLSearchParams({ input_token: accessToken, access_token: `${appId}|${appSecret}` });
  const json = await fetchJson<{ data?: { expires_at?: number; is_valid?: boolean } }>(
    `https://graph.facebook.com/${radarConfig.ads.metaGraphVersion}/debug_token?${params.toString()}`,
  );
  if (json.data?.is_valid === false) return 0;
  const expiresAt = json.data?.expires_at;
  if (!expiresAt) return null;
  return Math.floor((expiresAt * 1000 - Date.now()) / 86_400_000);
}
