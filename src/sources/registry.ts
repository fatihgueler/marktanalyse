/**
 * Zentrale Stelle, an der entschieden wird, welche Adapter aktiv sind und ob sie
 * live oder im Mock-Modus laufen. Der Mock-Modus greift automatisch, sobald ein Key fehlt.
 *
 * Werbebibliotheken (Meta, TikTok) implementieren `AdSignalSource`.
 * Offen: 1688.com als weitere `SupplySource` – nur über offiziellen Zugang (siehe PLAN-PHASE2.md, F1).
 * TikTok Creative Center hat keine offizielle API und wird deshalb nicht angebunden.
 */
import type { CollectEnv } from "@/lib/env";
import { AdLibraryMockSource } from "./ads/ad-library.mock";
import { MetaAdLibrarySource } from "./ads/meta-ad-library";
import { TikTokAdsSource } from "./ads/tiktok-ads";
import { GoogleTrendsMockSource } from "./demand/google-trends.mock";
import { GoogleTrendsSerpApiSource } from "./demand/google-trends.serpapi";
import { GoogleShoppingMockSource } from "./price/google-shopping.mock";
import { GoogleShoppingSerpApiSource } from "./price/google-shopping.serpapi";
import { AliExpressSource } from "./supply/aliexpress";
import { AliExpressMockSource } from "./supply/aliexpress.mock";
import type { AdSignalSource, PriceSource, SourceMode, SupplySource, TrendSource } from "./types";

/** Mock: TikTok zeigt für Produkt-Keywords weniger Werbetreibende als Meta. Nur für Demo-Daten. */
const MOCK_TIKTOK_FACTOR = 0.6;

export interface SourceSet {
  trend: TrendSource[];
  supply: SupplySource[];
  price: PriceSource;
  ads: AdSignalSource[];
}

export function createSources(env: CollectEnv, now: Date = new Date()): SourceSet {
  const trend: TrendSource[] = [
    env.SERPAPI_API_KEY ? new GoogleTrendsSerpApiSource(env.SERPAPI_API_KEY) : new GoogleTrendsMockSource(now),
  ];

  const { ALIEXPRESS_APP_KEY: appKey, ALIEXPRESS_APP_SECRET: appSecret, ALIEXPRESS_TRACKING_ID: trackingId } = env;
  const supply: SupplySource[] = [
    appKey && appSecret && trackingId ? new AliExpressSource({ appKey, appSecret, trackingId }) : new AliExpressMockSource(),
  ];

  const price: PriceSource = env.SERPAPI_API_KEY
    ? new GoogleShoppingSerpApiSource(env.SERPAPI_API_KEY)
    : new GoogleShoppingMockSource();

  const ads: AdSignalSource[] = [
    env.META_ACCESS_TOKEN
      ? new MetaAdLibrarySource(env.META_ACCESS_TOKEN)
      : new AdLibraryMockSource("meta-ad-library", "Meta Ad Library", 1, now),
    env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET
      ? new TikTokAdsSource(env.TIKTOK_CLIENT_KEY, env.TIKTOK_CLIENT_SECRET)
      : new AdLibraryMockSource("tiktok-ads", "TikTok Ad Library", MOCK_TIKTOK_FACTOR, now),
  ];

  return { trend, supply, price, ads };
}

/** Übersicht „Quelle → Modus“, wird pro Lauf gespeichert und im Dashboard angezeigt. */
export function describeModes(sources: SourceSet, judgeMode: SourceMode): Record<string, SourceMode> {
  const modes: Record<string, SourceMode> = {};
  for (const source of [...sources.trend, ...sources.supply, sources.price, ...sources.ads]) modes[source.id] = source.mode;
  modes.claude = judgeMode;
  return modes;
}
