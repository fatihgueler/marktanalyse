import { z } from "zod";
import { radarConfig, type Country } from "@/config/radar.config";
import { addWeeks, isoDate, mondayOf } from "@/lib/weeks";
import type { HashtagClassifier } from "@/matching/hashtag-classifier";
import { Throttle, fetchJson } from "../http";
import type { DemandRecord, DiscoveredKeyword, TokenStore, TrendPoint, TrendSource } from "../types";

const API = "https://api.pinterest.com/v5";
const AUTHORIZE_URL = "https://www.pinterest.com/oauth/";
export const PINTEREST_TOKEN_PROVIDER = "pinterest";
/** Lesezugriff genügt für die Trends-API */
const SCOPE = "user_accounts:read";

/** Trend-Suchbegriff mit Wochenkurve (Pinterest normiert jede Kurve auf 0–100). */
export interface PinterestTrend {
  keyword: string;
  growthWow: number | null;
  growthMom: number | null;
  growthYoy: number | null;
  series: TrendPoint[];
}

const trendsSchema = z.object({
  trends: z.array(
    z.looseObject({
      keyword: z.string(),
      pct_growth_wow: z.number().nullish(),
      pct_growth_mom: z.number().nullish(),
      pct_growth_yoy: z.number().nullish(),
      time_series: z.record(z.string(), z.number()).nullish(),
    }),
  ),
});

const tokenSchema = z.looseObject({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  refresh_token_expires_at: z.number().optional(),
  refresh_token_expires_in: z.number().optional(),
});

export interface PinterestToken {
  accessToken: string;
  /** neuer (rotierter) Refresh-Token, falls Pinterest einen ausgibt */
  refreshToken: string | null;
  refreshExpiresAt: Date | null;
}

/** Token-Endpunkt für beide Wege: Anmeldung (authorization_code) und Erneuerung (refresh_token). */
export async function requestPinterestToken(appId: string, appSecret: string, params: Record<string, string>): Promise<PinterestToken> {
  const json = await fetchJson<unknown>(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    // ANNAHME: continuous_refresh stellt Apps von vor dem 25.09.2025 auf rotierende Tokens um; neuere ignorieren es.
    body: new URLSearchParams({ ...params, continuous_refresh: "true" }).toString(),
  });
  const parsed = tokenSchema.parse(json);
  const refreshExpiresAt = parsed.refresh_token_expires_at
    ? new Date(parsed.refresh_token_expires_at * 1000)
    : parsed.refresh_token_expires_in
      ? new Date(Date.now() + parsed.refresh_token_expires_in * 1000)
      : null;
  return { accessToken: parsed.access_token, refreshToken: parsed.refresh_token ?? null, refreshExpiresAt };
}

/** Anmelde-Link „Mit Pinterest verbinden“; Pinterest leitet danach mit `code` auf `redirectUri` zurück. */
export function pinterestAuthorizeUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, response_type: "code", scope: SCOPE, state });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Wochenkurve aus `time_series`: Schlüssel = letzter Tag der Woche (laut API-Doku), Wert 0–100.
 * Wird auf den Montag der Woche gelegt, damit sie zu Google Trends passt.
 */
export function timeSeriesToWeekly(timeSeries: Record<string, number>): TrendPoint[] {
  const byWeek = new Map<string, number>();
  for (const [date, value] of Object.entries(timeSeries)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) continue;
    const weekEnd = new Date(`${date}T00:00:00Z`);
    byWeek.set(isoDate(mondayOf(addWeeks(weekEnd, -6 / 7))), value);
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, value]) => ({ weekStart, value }));
}

export function parseTrends(json: unknown): PinterestTrend[] {
  return trendsSchema.parse(json).trends.map((t) => ({
    keyword: t.keyword.trim().toLowerCase(),
    growthWow: t.pct_growth_wow ?? null,
    growthMom: t.pct_growth_mom ?? null,
    growthYoy: t.pct_growth_yoy ?? null,
    series: timeSeriesToWeekly(t.time_series ?? {}),
  }));
}

/**
 * Gemeinsame Logik für Live und Mock: Trend-Begriffe je Region holen (AT und CH teilen sich eine
 * Region und damit eine Abfrage), Produktbegriffe per Klassifizierer auswählen, Kurven zwischenspeichern.
 */
export abstract class PinterestTrendsSourceBase implements TrendSource {
  readonly id = "pinterest-trends";
  readonly label = "Pinterest Trends";
  abstract readonly mode: "live" | "mock";
  private readonly regions = new Map<string, Promise<PinterestTrend[]>>();
  private readonly found = new Map<string, PinterestTrend>();

  constructor(protected readonly classifier: HashtagClassifier) {}

  protected abstract loadTrends(region: string): Promise<PinterestTrend[]>;

  private trendsFor(region: string): Promise<PinterestTrend[]> {
    let pending = this.regions.get(region);
    if (!pending) {
      pending = this.loadTrends(region);
      this.regions.set(region, pending);
    }
    return pending;
  }

  /** Seeds spielen keine Rolle – Pinterest liefert die steigenden Begriffe je Region direkt. */
  async discoverKeywords(_seeds: string[], country: Country): Promise<DiscoveredKeyword[]> {
    const { ignore, trendType } = radarConfig.pinterest;
    const trends = (await this.trendsFor(radarConfig.countries[country].pinterestRegion)).filter(
      (t) => !t.keyword.split(/\s+/).some((word) => ignore.includes(word)),
    );
    const verdicts = await this.classifier.classify(
      trends.map((t) => t.keyword),
      country,
      "pinterest",
    );
    const discovered: DiscoveredKeyword[] = [];
    for (const [index, verdict] of verdicts.entries()) {
      const trend = trends[index];
      if (!trend || !verdict.keyword) continue;
      const key = `${country}|${verdict.keyword}`;
      if (this.found.has(key)) continue;
      this.found.set(key, trend);
      const growth = trend.growthMom ?? trend.growthWow;
      discovered.push({ keyword: verdict.keyword, seedTerm: trend.keyword, signal: growth === null ? trendType : `${growth > 0 ? "+" : ""}${growth} % ggü. Vormonat` });
    }
    return discovered;
  }

  async fetchSeries(keyword: string, seedTerm: string | null, country: Country): Promise<DemandRecord | null> {
    const trend = this.found.get(`${country}|${keyword}`);
    if (!trend) return null;
    return {
      source: this.id,
      country,
      fetchedAt: new Date(),
      keyword,
      seedTerm,
      series: trend.series,
      raw: { pinterestKeyword: trend.keyword, growthWow: trend.growthWow, growthMom: trend.growthMom, growthYoy: trend.growthYoy, mode: this.mode },
    };
  }
}

export interface PinterestCredentials {
  accessToken?: string;
  appId?: string;
  appSecret?: string;
  refreshToken?: string;
}

/**
 * Zugang zur Pinterest-API. Mit App-ID und App-Secret und einem Refresh-Token (aus „Mit Pinterest
 * verbinden“ im Dashboard oder aus PINTEREST_REFRESH_TOKEN) erneuert der Radar das Access-Token vor jedem Lauf selbst. Pinterest gibt dabei einen neuen Refresh-Token aus (60 Tage gültig),
 * der in der Datenbank landet – der Zugang bleibt so dauerhaft gültig, solange mindestens alle
 * 60 Tage ein Lauf stattfindet. Ohne diese Angaben gilt nur `PINTEREST_ACCESS_TOKEN` (30 Tage).
 */
export class PinterestAuth {
  private cached: Promise<string> | null = null;
  /** Ablauf des aktuell gültigen Refresh-Tokens – für die Warnung vor Ablauf */
  refreshExpiresAt: Date | null = null;

  constructor(
    private readonly credentials: PinterestCredentials,
    private readonly store: TokenStore | null,
  ) {}

  get canRefresh(): boolean {
    return Boolean(this.credentials.appId && this.credentials.appSecret && (this.credentials.refreshToken || this.store));
  }

  accessToken(): Promise<string> {
    this.cached ??= this.obtain();
    return this.cached;
  }

  private async obtain(): Promise<string> {
    if (!this.canRefresh) {
      if (this.credentials.accessToken) return this.credentials.accessToken;
      throw new Error("Pinterest: PINTEREST_APP_ID und PINTEREST_APP_SECRET fehlen.");
    }
    const stored = await this.store?.load(PINTEREST_TOKEN_PROVIDER);
    // Zuerst der zuletzt gespeicherte (neueste) Token, dann der aus der Umgebung – z. B. nach manueller Erneuerung.
    const candidates = [...new Set([stored?.refreshToken, this.credentials.refreshToken].filter((t): t is string => Boolean(t)))];
    let lastError: unknown = null;
    for (const refreshToken of candidates) {
      try {
        return await this.refresh(refreshToken, stored?.expiresAt ?? null);
      } catch (error) {
        lastError = error;
      }
    }
    if (this.credentials.accessToken) return this.credentials.accessToken;
    if (lastError === null) throw new Error("Pinterest ist noch nicht verbunden – im Dashboard unter „Quellen“ auf „Mit Pinterest verbinden“ klicken.");
    const reason = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Pinterest: Token-Erneuerung fehlgeschlagen (${reason}). Im Dashboard unter „Quellen“ neu verbinden.`);
  }

  private async refresh(refreshToken: string, knownExpiry: Date | null): Promise<string> {
    const token = await requestPinterestToken(this.credentials.appId!, this.credentials.appSecret!, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (token.refreshToken) await this.store?.save(PINTEREST_TOKEN_PROVIDER, token.refreshToken, token.refreshExpiresAt);
    this.refreshExpiresAt = token.refreshToken ? token.refreshExpiresAt : knownExpiry;
    return token.accessToken;
  }
}

/** Live: Pinterest API v5, Endpunkt „List trending keywords“. */
export class PinterestTrendsSource extends PinterestTrendsSourceBase {
  readonly mode = "live" as const;
  private readonly throttle = new Throttle();

  constructor(
    readonly auth: PinterestAuth,
    classifier: HashtagClassifier,
  ) {
    super(classifier);
  }

  /** Öffentlich für den Verbindungstest (`npm run check`). */
  async loadTrends(region: string): Promise<PinterestTrend[]> {
    const { trendType, interests, limit } = radarConfig.pinterest;
    const params = new URLSearchParams({ limit: String(limit) });
    // ANNAHME: Array-Parameter werden wiederholt übergeben (OpenAPI-Standard „form, explode“).
    for (const interest of interests) params.append("interests", interest);
    const json = await fetchJson<unknown>(
      `${API}/trends/keywords/${encodeURIComponent(region)}/top/${trendType}?${params.toString()}`,
      { headers: { Authorization: `Bearer ${await this.auth.accessToken()}` } },
      this.throttle,
    );
    return parseTrends(json);
  }
}
