/**
 * Zentrale Stelle, an der entschieden wird, welche Adapter aktiv sind und ob sie
 * live oder im Mock-Modus laufen. Der Mock-Modus greift automatisch, sobald ein Key fehlt.
 *
 * Werbebibliotheken (Meta, TikTok) implementieren `AdSignalSource`.
 * Phase 2b: TikTok Creative Center (`TrendSource`) und 1688 (`SupplySource`) laufen über den
 * Scraping-Dienst Apify (APIFY_TOKEN) – bewusste Entscheidung des Auftraggebers, siehe PLAN-PHASE2.md §9.
 * Kostenlose Zusatzquellen: Pinterest Trends (`TrendSource`) und eBay (`MarketSource`).
 */
import { perRunBudget } from "@/config/config-check";
import type { CollectEnv } from "@/lib/env";
import { SearchBudget } from "./budget";
import { AdLibraryMockSource } from "./ads/ad-library.mock";
import { MetaAdLibrarySource } from "./ads/meta-ad-library";
import { TikTokAdsSource } from "./ads/tiktok-ads";
import { createHashtagClassifier } from "@/matching/hashtag-classifier";
import { ClaudeKeywordTranslator } from "@/matching/keyword-translator";
import { Alibaba1688ApifySource } from "./scraping/alibaba-1688";
import { Alibaba1688MockSource } from "./scraping/alibaba-1688.mock";
import { TikTokHashtagsApifySource } from "./scraping/tiktok-hashtags";
import { TikTokHashtagsMockSource } from "./scraping/tiktok-hashtags.mock";
import { GoogleTrendsMockSource } from "./demand/google-trends.mock";
import { GoogleTrendsSerpApiSource } from "./demand/google-trends.serpapi";
import { PinterestAuth, PinterestTrendsSource } from "./demand/pinterest-trends";
import { PinterestTrendsMockSource } from "./demand/pinterest-trends.mock";
import { EbaySource } from "./market/ebay";
import { EbayMockSource } from "./market/ebay.mock";
import { GoogleShoppingMockSource } from "./price/google-shopping.mock";
import { GoogleShoppingSerpApiSource } from "./price/google-shopping.serpapi";
import { AliExpressSource } from "./supply/aliexpress";
import { AliExpressMockSource } from "./supply/aliexpress.mock";
import type { AdSignalSource, MarketSource, PriceSource, RunSourceMode, SourceMode, SupplySource, TokenStore, TrendSource } from "./types";

/** Mock: TikTok zeigt für Produkt-Keywords weniger Werbetreibende als Meta. Nur für Demo-Daten. */
const MOCK_TIKTOK_FACTOR = 0.6;

export interface SourceSet {
  /** gemeinsames SerpApi-Budget (Trends + Shopping); null im Mock-Modus */
  serpApiBudget: SearchBudget | null;
  trend: TrendSource[];
  supply: SupplySource[];
  /** null = im Echtbetrieb abgeschaltet (kein Key) → Kategorie-Faktor bzw. eBay-Preis */
  price: PriceSource | null;
  /** null = im Echtbetrieb abgeschaltet → Marktplatz-Wettbewerb neutral, kein eBay-Preis */
  market: MarketSource | null;
  ads: AdSignalSource[];
  /** Demo-Quellen, die im Echtbetrieb nicht mitlaufen (IDs) */
  disabled: string[];
  /** Pinterest-Zugang (live), für die Warnung vor Ablauf des Refresh-Tokens */
  pinterestAuth: PinterestAuth | null;
}

/** Rotierende Tokens (Pinterest) werden im `tokenStore` gespeichert; ohne Store gilt nur der Wert aus der Umgebung. */
export function createSources(env: CollectEnv, now: Date = new Date(), tokenStore: TokenStore | null = null): SourceSet {
  const serpApiBudget = env.SERPAPI_API_KEY ? new SearchBudget("SerpApi", perRunBudget().serpApiSearches) : null;
  const hashtagClassifier = createHashtagClassifier(env);
  const pinterestLive = Boolean(env.PINTEREST_ACCESS_TOKEN || (env.PINTEREST_APP_ID && env.PINTEREST_APP_SECRET && env.PINTEREST_REFRESH_TOKEN));
  const pinterestAuth = pinterestLive
    ? new PinterestAuth(
        {
          accessToken: env.PINTEREST_ACCESS_TOKEN,
          appId: env.PINTEREST_APP_ID,
          appSecret: env.PINTEREST_APP_SECRET,
          refreshToken: env.PINTEREST_REFRESH_TOKEN,
        },
        tokenStore,
      )
    : null;
  const trend: TrendSource[] = [
    env.SERPAPI_API_KEY && serpApiBudget ? new GoogleTrendsSerpApiSource(env.SERPAPI_API_KEY, serpApiBudget) : new GoogleTrendsMockSource(now),
    env.APIFY_TOKEN ? new TikTokHashtagsApifySource(env.APIFY_TOKEN, hashtagClassifier) : new TikTokHashtagsMockSource(hashtagClassifier, now),
    pinterestAuth ? new PinterestTrendsSource(pinterestAuth, hashtagClassifier) : new PinterestTrendsMockSource(hashtagClassifier, now),
  ];

  const { ALIEXPRESS_APP_KEY: appKey, ALIEXPRESS_APP_SECRET: appSecret, ALIEXPRESS_TRACKING_ID: trackingId } = env;
  const supply: SupplySource[] = [
    appKey && appSecret && trackingId ? new AliExpressSource({ appKey, appSecret, trackingId }) : new AliExpressMockSource(),
    env.APIFY_TOKEN
      ? new Alibaba1688ApifySource(env.APIFY_TOKEN, env.ANTHROPIC_API_KEY ? new ClaudeKeywordTranslator(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : null)
      : new Alibaba1688MockSource(),
  ];

  const price: PriceSource =
    env.SERPAPI_API_KEY && serpApiBudget ? new GoogleShoppingSerpApiSource(env.SERPAPI_API_KEY, serpApiBudget) : new GoogleShoppingMockSource();

  const market: MarketSource =
    env.EBAY_CLIENT_ID && env.EBAY_CLIENT_SECRET ? new EbaySource(env.EBAY_CLIENT_ID, env.EBAY_CLIENT_SECRET) : new EbayMockSource();

  const ads: AdSignalSource[] = [
    env.META_ACCESS_TOKEN
      ? new MetaAdLibrarySource(env.META_ACCESS_TOKEN)
      : new AdLibraryMockSource("meta-ad-library", "Meta Ad Library", 1, now),
    env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET
      ? new TikTokAdsSource(env.TIKTOK_CLIENT_KEY, env.TIKTOK_CLIENT_SECRET)
      : new AdLibraryMockSource("tiktok-ads", "TikTok Ad Library", MOCK_TIKTOK_FACTOR, now),
  ];

  // Echtbetrieb: Sobald Trends oder Angebote live sind, laufen Demo-Quellen nicht mehr mit – sonst mischten
  // sich erfundene Keywords, Preise und Werbezahlen in echte Ergebnisse. Fehlende Signale zählen neutral.
  const liveOperation = [...trend, ...supply].some((source) => source.mode === "live");
  const keep = (source: { mode: SourceMode }) => !liveOperation || source.mode === "live";
  const all = [...trend, ...supply, price, market, ...ads];
  return {
    serpApiBudget,
    trend: trend.filter(keep),
    supply: supply.filter(keep),
    price: keep(price) ? price : null,
    market: keep(market) ? market : null,
    ads: ads.filter(keep),
    disabled: all.filter((source) => !keep(source)).map((source) => source.id),
    pinterestAuth,
  };
}

/** Übersicht „Quelle → Modus“, wird pro Lauf gespeichert und im Dashboard angezeigt. */
export function describeModes(sources: SourceSet, judgeMode: SourceMode): Record<string, RunSourceMode> {
  const modes: Record<string, RunSourceMode> = {};
  const active = [...sources.trend, ...sources.supply, sources.price, sources.market, ...sources.ads].filter((s) => s !== null);
  for (const source of active) modes[source.id] = source.mode;
  for (const id of sources.disabled) modes[id] = "off";
  modes.claude = judgeMode;
  return modes;
}
