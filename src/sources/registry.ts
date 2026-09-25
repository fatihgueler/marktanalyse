/**
 * Zentrale Stelle, an der entschieden wird, welche Adapter aktiv sind und ob sie
 * live oder im Mock-Modus laufen. Der Mock-Modus greift automatisch, sobald ein Key fehlt.
 *
 * Phase 2 (nicht umgesetzt): weitere Quellen hier ergänzen –
 *   trend:  TikTok Creative Center, Meta Ad Library  → implementieren `TrendSource`
 *   supply: 1688.com (nur über offizielle API/Datendienst) → implementiert `SupplySource`
 */
import type { CollectEnv } from "@/lib/env";
import { GoogleTrendsMockSource } from "./demand/google-trends.mock";
import { GoogleTrendsSerpApiSource } from "./demand/google-trends.serpapi";
import { GoogleShoppingMockSource } from "./price/google-shopping.mock";
import { GoogleShoppingSerpApiSource } from "./price/google-shopping.serpapi";
import { AliExpressSource } from "./supply/aliexpress";
import { AliExpressMockSource } from "./supply/aliexpress.mock";
import type { PriceSource, SourceMode, SupplySource, TrendSource } from "./types";

export interface SourceSet {
  trend: TrendSource[];
  supply: SupplySource[];
  price: PriceSource;
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

  return { trend, supply, price };
}

/** Übersicht „Quelle → Modus“, wird pro Lauf gespeichert und im Dashboard angezeigt. */
export function describeModes(sources: SourceSet, judgeMode: SourceMode): Record<string, SourceMode> {
  const modes: Record<string, SourceMode> = {};
  for (const source of [...sources.trend, ...sources.supply, sources.price]) modes[source.id] = source.mode;
  modes.claude = judgeMode;
  return modes;
}
