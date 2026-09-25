import { z } from "zod";
import { radarConfig, type Country } from "@/config/radar.config";
import { Throttle, fetchJson } from "../http";
import type { AdRecord, AdSignalSource } from "../types";
import { isCovered, notCovered, summarizeAds, type RawAd } from "./summarize";

const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const QUERY_URL = "https://open.tiktokapis.com/v2/research/adlib/ad/query/";
const FIELDS = "ad.id,ad.first_shown_date,ad.status,advertiser.business_id,advertiser.business_name";
/** Maximum der API je Seite */
const PAGE_SIZE = 10;
/** Suchbegriffe sind auf 50 Zeichen begrenzt */
const MAX_SEARCH_TERM = 50;
/** Token 60 s vor Ablauf erneuern */
const TOKEN_SAFETY_MS = 60_000;

const tokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });

const querySchema = z.object({
  data: z
    .object({
      ads: z
        .array(
          z.object({
            ad: z.object({ id: z.union([z.string(), z.number()]).transform(String), first_shown_date: z.union([z.string(), z.number()]).optional() }),
            advertiser: z.object({ business_id: z.union([z.string(), z.number()]).transform(String).optional(), business_name: z.string().optional() }).optional(),
          }),
        )
        .optional(),
      has_more: z.boolean().optional(),
      search_id: z.string().optional(),
    })
    .optional(),
  error: z.object({ code: z.string(), message: z.string().optional() }).optional(),
});

/** 20260115 → Date (UTC) */
function parseYmd(value: string | number | undefined): Date | null {
  const text = value === undefined ? "" : String(value);
  if (!/^\d{8}$/.test(text)) return null;
  return new Date(Date.UTC(Number(text.slice(0, 4)), Number(text.slice(4, 6)) - 1, Number(text.slice(6, 8))));
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

/** TikTok Commercial Content API (Anzeigen). Erfordert eine von TikTok genehmigte App. */
export class TikTokAdsSource implements AdSignalSource {
  readonly id = "tiktok-ads";
  readonly label = "TikTok Ad Library";
  readonly mode = "live" as const;
  private readonly throttle = new Throttle();
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientKey: string,
    private readonly clientSecret: string,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const json = await fetchJson<unknown>(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: this.clientKey, client_secret: this.clientSecret, grant_type: "client_credentials" }).toString(),
    });
    const parsed = tokenSchema.parse(json);
    this.token = { value: parsed.access_token, expiresAt: Date.now() + parsed.expires_in * 1000 - TOKEN_SAFETY_MS };
    return parsed.access_token;
  }

  async adActivity(keyword: string, country: Country): Promise<AdRecord> {
    if (!isCovered(country)) return notCovered(this.id, keyword, country);
    const { lookbackDays } = radarConfig.ads;
    const maxAdsPerKeyword = radarConfig.ads.maxAdsPerKeyword.tiktok;
    const now = new Date();
    const min = new Date(now.getTime() - lookbackDays * 86_400_000);

    const ads: RawAd[] = [];
    let searchId: string | undefined;
    let hasMore = true;
    while (hasMore && ads.length < maxAdsPerKeyword) {
      const token = await this.accessToken();
      const json = await fetchJson<unknown>(
        `${QUERY_URL}?fields=${FIELDS}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: {
              ad_published_date_range: { min: ymd(min), max: ymd(now) },
              // ANNAHME: Die Doku nennt den Filter in der Tabelle `country_code_list`, im Beispiel
              // `country_code` – wir folgen dem Beispiel-Request.
              country_code: [country],
              ad_status: "ACTIVE",
            },
            search_term: keyword.slice(0, MAX_SEARCH_TERM),
            search_type: "exact_phrase",
            max_count: PAGE_SIZE,
            ...(searchId ? { search_id: searchId } : {}),
          }),
        },
        this.throttle,
      );
      const parsed = querySchema.parse(json);
      if (parsed.error && parsed.error.code !== "ok") {
        throw new Error(`TikTok Ad Library: ${parsed.error.code} ${parsed.error.message ?? ""}`.trim());
      }
      for (const item of parsed.data?.ads ?? []) {
        const startedAt = parseYmd(item.ad.first_shown_date);
        if (!startedAt) continue;
        ads.push({
          advertiserId: item.advertiser?.business_id ?? item.ad.id,
          advertiserName: item.advertiser?.business_name ?? "unbekannt",
          startedAt,
          // ANNAHME: öffentliche Detailseite der TikTok Ad Library
          previewUrl: `https://library.tiktok.com/ads/detail/?ad_id=${encodeURIComponent(item.ad.id)}`,
        });
      }
      hasMore = parsed.data?.has_more ?? false;
      searchId = parsed.data?.search_id;
    }

    const kept = ads.slice(0, maxAdsPerKeyword);
    return summarizeAds({
      source: this.id,
      keyword,
      country,
      ads: kept,
      capped: hasMore || ads.length > maxAdsPerKeyword,
      raw: { ads: kept.map((a) => ({ advertiser: a.advertiserName, start: a.startedAt.toISOString(), url: a.previewUrl })) },
    });
  }
}
