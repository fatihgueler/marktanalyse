/**
 * `npm run check` – Verbindungstest nach dem Eintragen der Keys.
 *
 * Prüft jeden gesetzten Key mit einem kostenlosen Aufruf (SerpApi Account-API, Anthropic Modell-Info,
 * Apify-Kontolimits) bzw. einer kleinen Abfrage bei den kostenlosen APIs (AliExpress, eBay, Pinterest,
 * Meta, TikTok, EZB). Verbraucht keine bezahlten Suchen.
 *
 * Achtung Pinterest: Die Prüfung erneuert den Refresh-Token und speichert den neuen in der Datenbank,
 * mit der sie verbunden ist. Deshalb dort ausführen, wo auch der Lauf läuft (Railway).
 *
 * `npm run check -- --probe` fragt zusätzlich die kostenpflichtigen Quellen je einmal echt ab und prüft
 * so, ob ihre Antworten zum Code passen: 3 SerpApi-Suchen und höchstens ~0,25 $ Apify.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import { radarConfig } from "@/config/radar.config";
import { getDb } from "@/lib/db";
import { createDbTokenStore } from "@/lib/token-store";
import { readCollectEnv, type CollectEnv } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { worstCaseSerpApiSearches, perRunBudget } from "@/config/config-check";
import { createJudge } from "@/matching/match";
import { createHashtagClassifier } from "@/matching/hashtag-classifier";
import { ClaudeKeywordTranslator } from "@/matching/keyword-translator";
import { metaTokenDaysLeft, MetaAdLibrarySource } from "@/sources/ads/meta-ad-library";
import { TikTokAdsSource } from "@/sources/ads/tiktok-ads";
import { SearchBudget } from "@/sources/budget";
import { GoogleTrendsSerpApiSource } from "@/sources/demand/google-trends.serpapi";
import { PinterestAuth, PinterestTrendsSource } from "@/sources/demand/pinterest-trends";
import { loadFxRates } from "@/sources/fx/ecb";
import { EbaySource } from "@/sources/market/ebay";
import { fetchJson } from "@/sources/http";
import { fetchSerpApiAccount } from "@/sources/serpapi-account";
import { GoogleShoppingSerpApiSource } from "@/sources/price/google-shopping.serpapi";
import { mixedModeWarnings } from "@/sources/readiness";
import { createSources, describeModes } from "@/sources/registry";
import { Alibaba1688ApifySource } from "@/sources/scraping/alibaba-1688";
import { TikTokHashtagsApifySource } from "@/sources/scraping/tiktok-hashtags";
import { AliExpressSource } from "@/sources/supply/aliexpress";

loadDotenv({ quiet: true });

/** Allgemeiner Begriff, zu dem jede Quelle sicher Treffer hat */
const PROBE_KEYWORD = "led lampe";

type Outcome = { status: "ok" | "fehler" | "aus" | "hinweis"; detail: string };
const ICON: Record<Outcome["status"], string> = { ok: "✅", fehler: "❌", aus: "➖", hinweis: "⚠️ " };

function errorMessage(error: unknown): string {
  if (error instanceof Anthropic.APIError) return `HTTP ${error.status ?? "?"}: ${error.message}`;
  if (error instanceof Error) {
    const body = (error as { body?: unknown }).body;
    const text = typeof body === "string" && body ? `${error.message} – ${body}` : error.message;
    return text.replace(/\s+/g, " ").slice(0, 300);
  }
  return String(error);
}

async function attempt(run: () => Promise<Outcome>): Promise<Outcome> {
  try {
    return await run();
  } catch (error) {
    return { status: "fehler", detail: errorMessage(error) };
  }
}


const apifyLimitsSchema = z.object({
  data: z.looseObject({
    limits: z.looseObject({ maxMonthlyUsageUsd: z.number().optional() }),
    current: z.looseObject({ monthlyUsageUsd: z.number().optional() }),
  }),
});

async function checkDatabase(): Promise<Outcome> {
  const runs = await getDb().run.count();
  return { status: "ok", detail: `erreichbar, ${runs} Läufe gespeichert` };
}

async function checkSerpApi(key: string | undefined): Promise<Outcome> {
  if (!key) return { status: "aus", detail: "SERPAPI_API_KEY fehlt → Google Trends und Referenzpreise laufen mit Demo-Daten" };
  const account = await fetchSerpApiAccount(key);
  const left = account.left;
  const perRun = worstCaseSerpApiSearches();
  const minUseful = radarConfig.budget.serpApiMinSearchesPerRun;
  const runs = left === null ? "?" : String(Math.floor(left / perRun));
  const tooLow = left !== null && left < minUseful ? ` – zu wenig für einen Lauf (mind. ${minUseful}), der nächste Lauf fällt bis zur Erneuerung aus` : "";
  return {
    status: left !== null && left < perRun ? "hinweis" : "ok",
    detail: `Plan „${account.planName ?? "?"}“, noch ${left ?? "?"} von ${account.perMonth ?? "?"} Suchen diesen Monat → reicht für ${runs} volle Läufe (je höchstens ${perRun})${tooLow}`,
  };
}

async function checkAnthropic(env: CollectEnv): Promise<Outcome> {
  if (!env.ANTHROPIC_API_KEY) return { status: "aus", detail: "ANTHROPIC_API_KEY fehlt → Matching per Heuristik, 1688 wird übersprungen" };
  const model = await new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }).models.retrieve(env.ANTHROPIC_MODEL);
  return { status: "ok", detail: `Key gültig, Modell ${model.id} verfügbar` };
}

async function checkAliExpress(env: CollectEnv): Promise<Outcome> {
  const { ALIEXPRESS_APP_KEY: appKey, ALIEXPRESS_APP_SECRET: appSecret, ALIEXPRESS_TRACKING_ID: trackingId } = env;
  if (!appKey && !appSecret && !trackingId) return { status: "aus", detail: "AliExpress-Keys fehlen → Angebote sind Demo-Daten" };
  if (!appKey || !appSecret || !trackingId) {
    return { status: "fehler", detail: "Es braucht alle drei: ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID" };
  }
  const offers = await new AliExpressSource({ appKey, appSecret, trackingId }).search(PROBE_KEYWORD, "DE", 3);
  if (offers.length === 0) return { status: "hinweis", detail: `Anmeldung ok, aber 0 Treffer für „${PROBE_KEYWORD}“ – Tracking-ID prüfen` };
  const first = offers[0];
  return { status: "ok", detail: `${offers.length} Treffer, z. B. „${first?.title.slice(0, 50)}“ für ${formatMoney(first?.price ?? 0, first?.currency ?? "EUR")}` };
}

async function checkEbay(env: CollectEnv): Promise<Outcome> {
  if (!env.EBAY_CLIENT_ID && !env.EBAY_CLIENT_SECRET) return { status: "aus", detail: "EBAY_CLIENT_ID/SECRET fehlen → kein Wettbewerb im Zielland, Preise meist nur geschätzt" };
  if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) return { status: "fehler", detail: "Es braucht beide: EBAY_CLIENT_ID und EBAY_CLIENT_SECRET" };
  const record = await new EbaySource(env.EBAY_CLIENT_ID, env.EBAY_CLIENT_SECRET).marketActivity(PROBE_KEYWORD, "DE");
  const asia = record.asiaShare === null ? "" : `, ${Math.round(record.asiaShare * 100)} % mit Versand aus Asien`;
  const price = record.price ? `, Median ${formatMoney(record.price.medianPrice, record.price.currency)}` : "";
  return { status: "ok", detail: `${record.totalListings.toLocaleString("de-DE")} Angebote für „${PROBE_KEYWORD}“ auf ebay.de${asia}${price}` };
}

async function checkPinterest(env: CollectEnv): Promise<Outcome> {
  const credentials = {
    accessToken: env.PINTEREST_ACCESS_TOKEN,
    appId: env.PINTEREST_APP_ID,
    appSecret: env.PINTEREST_APP_SECRET,
    refreshToken: env.PINTEREST_REFRESH_TOKEN,
  };
  if (!credentials.accessToken && !(credentials.appId && credentials.appSecret)) {
    return { status: "aus", detail: "PINTEREST_APP_ID/SECRET fehlen → keine Pinterest-Trends" };
  }
  const auth = new PinterestAuth(credentials, createDbTokenStore());
  const trends = await new PinterestTrendsSource(auth, createHashtagClassifier(env)).loadTrends(radarConfig.countries.DE.pinterestRegion);
  const first = trends[0];
  const example = first ? `, z. B. „${first.keyword}“ (${first.growthMom ?? "?"} % ggü. Vormonat)` : "";
  const renewal = auth.canRefresh
    ? auth.refreshExpiresAt
      ? `Zugang erneuert sich selbst (Refresh-Token gültig bis ${auth.refreshExpiresAt.toLocaleDateString("de-DE")})`
      : "Zugang erneuert sich selbst"
    : "nur Access-Token – läuft nach 30 Tagen ab, App-ID/Secret/Refresh-Token empfohlen";
  return { status: auth.canRefresh ? "ok" : "hinweis", detail: `${trends.length} steigende Begriffe in DE${example}; ${renewal}` };
}

async function checkEzb(): Promise<Outcome> {
  const { fx, warning } = await loadFxRates();
  if (fx.source === "config") return { status: warning ? "hinweis" : "aus", detail: warning ?? "abgeschaltet (fxUpdate.source = config) → feste Kurse" };
  const rates = ["USD", "CNY", "GBP", "CHF"].map((c) => `${c} ${fx.rates[c]}`).join(", ");
  return { status: warning ? "hinweis" : "ok", detail: `Kurse vom ${fx.date}: 1 EUR = ${rates}${warning ? ` – ${warning}` : ""}` };
}

async function checkMeta(env: CollectEnv): Promise<Outcome> {
  if (!env.META_ACCESS_TOKEN) return { status: "aus", detail: "META_ACCESS_TOKEN fehlt → Meta-Werbedaten sind Demo-Daten" };
  const record = await new MetaAdLibrarySource(env.META_ACCESS_TOKEN).adActivity(PROBE_KEYWORD, "DE");
  let expiry = "Ablauf wird nicht überwacht (META_APP_ID/META_APP_SECRET fehlen)";
  if (env.META_APP_ID && env.META_APP_SECRET) {
    const days = await metaTokenDaysLeft(env.META_ACCESS_TOKEN, env.META_APP_ID, env.META_APP_SECRET);
    expiry = days === null ? "Token läuft nicht ab" : `Token läuft in ${days} Tagen ab`;
  }
  return { status: "ok", detail: `${record.activeAds}${record.capped ? "+" : ""} aktive Anzeigen von ${record.advertisers} Werbetreibenden für „${PROBE_KEYWORD}“ in DE; ${expiry}` };
}

async function checkTikTokAds(env: CollectEnv): Promise<Outcome> {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) return { status: "aus", detail: "TIKTOK_CLIENT_KEY/SECRET fehlen → TikTok-Werbedaten sind Demo-Daten" };
  const record = await new TikTokAdsSource(env.TIKTOK_CLIENT_KEY, env.TIKTOK_CLIENT_SECRET).adActivity(PROBE_KEYWORD, "DE");
  return { status: "ok", detail: `${record.activeAds}${record.capped ? "+" : ""} aktive Anzeigen von ${record.advertisers} Werbetreibenden für „${PROBE_KEYWORD}“ in DE` };
}

async function checkApify(token: string | undefined): Promise<Outcome> {
  if (!token) return { status: "aus", detail: "APIFY_TOKEN fehlt → TikTok-Trends und 1688 sind Demo-Daten" };
  const headers = { Authorization: `Bearer ${token}` };
  const limits = apifyLimitsSchema.parse(await fetchJson<unknown>("https://api.apify.com/v2/users/me/limits", { headers }));
  const { tiktokHashtags, alibaba1688 } = radarConfig.scraping;
  for (const actorId of [tiktokHashtags.actorId, alibaba1688.actorId]) {
    await fetchJson<unknown>(`https://api.apify.com/v2/acts/${actorId}`, { headers });
  }
  const used = limits.data.current.monthlyUsageUsd ?? 0;
  const max = limits.data.limits.maxMonthlyUsageUsd;
  return {
    status: "ok",
    detail: `Token gültig, beide Actors erreichbar; diesen Monat ${used.toFixed(2)} $ von ${max ?? "?"} $ verbraucht (je Lauf höchstens ${perRunBudget().apifyUsd.toFixed(2)} $)`,
  };
}

/** Echte Abfragen der kostenpflichtigen Quellen – prüft, ob die Antworten zum Code passen. */
async function probe(env: CollectEnv): Promise<[string, Outcome][]> {
  const results: [string, Outcome][] = [];
  if (env.SERPAPI_API_KEY) {
    const budget = new SearchBudget("SerpApi-Probe", 3);
    const trends = new GoogleTrendsSerpApiSource(env.SERPAPI_API_KEY, budget);
    results.push([
      "Google Trends",
      await attempt(async () => {
        const keywords = await trends.discoverKeywords(["lampe"], "DE");
        const first = keywords[0];
        if (!first) return { status: "hinweis", detail: "Abfrage ok, aber keine steigenden Suchbegriffe zu „lampe“" };
        const series = await trends.fetchSeries(first.keyword, first.seedTerm, "DE");
        return { status: "ok", detail: `${keywords.length} steigende Begriffe, z. B. „${first.keyword}“ mit ${series?.series.length ?? 0} Wochenwerten` };
      }),
    ]);
    results.push([
      "Google Shopping",
      await attempt(async () => {
        const price = await new GoogleShoppingSerpApiSource(env.SERPAPI_API_KEY!, budget).referencePrice(PROBE_KEYWORD, "DE");
        return price
          ? { status: "ok", detail: `Medianpreis ${formatMoney(price.medianPrice, price.currency)} aus ${price.sampleSize} Angeboten` }
          : { status: "hinweis", detail: "Abfrage ok, aber zu wenige Preise – Fallback greift" };
      }),
    ]);
  }
  if (env.APIFY_TOKEN) {
    results.push([
      "TikTok-Trends",
      await attempt(async () => {
        const keywords = await new TikTokHashtagsApifySource(env.APIFY_TOKEN!, createHashtagClassifier(env)).discoverKeywords([], "DE");
        return { status: keywords.length > 0 ? "ok" : "hinweis", detail: `${keywords.length} Produkt-Hashtags erkannt${keywords[0] ? `, z. B. „${keywords[0].keyword}“` : ""}` };
      }),
    ]);
    results.push([
      "1688",
      await attempt(async () => {
        const translator = env.ANTHROPIC_API_KEY ? new ClaudeKeywordTranslator(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : null;
        const offers = await new Alibaba1688ApifySource(env.APIFY_TOKEN!, translator).search(PROBE_KEYWORD, "DE", 3);
        const first = offers[0];
        return first
          ? { status: "ok", detail: `${offers.length} Angebote, z. B. „${first.title.slice(0, 40)}“ ab ${first.price} ${first.currency}` }
          : { status: "hinweis", detail: "Abfrage ok, aber keine Angebote" };
      }),
    ]);
  }
  return results;
}

function print(label: string, outcome: Outcome) {
  console.log(`  ${ICON[outcome.status]} ${label.padEnd(18)} ${outcome.detail}`);
}

async function main(): Promise<number> {
  const withProbe = process.argv.includes("--probe");
  const env = readCollectEnv();

  console.log("Trend-Radar – Verbindungstest (kostenlos)\n");
  const checks: [string, Promise<Outcome>][] = [
    ["Datenbank", attempt(checkDatabase)],
    ["SerpApi", attempt(() => checkSerpApi(env.SERPAPI_API_KEY))],
    ["Claude", attempt(() => checkAnthropic(env))],
    ["AliExpress", attempt(() => checkAliExpress(env))],
    ["eBay", attempt(() => checkEbay(env))],
    ["Pinterest", attempt(() => checkPinterest(env))],
    ["EZB-Kurse", attempt(checkEzb)],
    ["Meta Ad Library", attempt(() => checkMeta(env))],
    ["TikTok Ad Library", attempt(() => checkTikTokAds(env))],
    ["Apify", attempt(() => checkApify(env.APIFY_TOKEN))],
  ];
  const outcomes: Outcome[] = [];
  for (const [label, pending] of checks) {
    const outcome = await pending;
    outcomes.push(outcome);
    print(label, outcome);
  }

  if (withProbe) {
    console.log("\nProbeabfragen (kostenpflichtig: 3 SerpApi-Suchen, höchstens ~0,25 $ Apify)\n");
    const probes = await probe(env);
    if (probes.length === 0) console.log("  Keine kostenpflichtige Quelle konfiguriert.");
    for (const [label, outcome] of probes) {
      outcomes.push(outcome);
      print(label, outcome);
    }
  }

  const modes = describeModes(createSources(env), createJudge(env).mode);
  const live = Object.entries(modes).filter(([, mode]) => mode === "live").map(([id]) => id);
  console.log(`\nNächster Lauf: ${live.length === 0 ? "komplett mit Demo-Daten" : `live mit ${live.join(", ")}`}`);
  for (const warning of mixedModeWarnings(modes)) console.log(`  ⚠️  ${warning}`);

  const failed = outcomes.filter((o) => o.status === "fehler").length;
  if (failed > 0) {
    console.log(`\n${failed} Prüfung(en) fehlgeschlagen – Keys in .env bzw. Railway-Variablen prüfen.`);
  } else if (live.length > 0) {
    console.log(withProbe ? "\nAlles bereit: `npm run collect -- --live`" : "\nKeys ok. Optional: `npm run check -- --probe`, dann `npm run collect -- --live`");
  }
  await getDb().$disconnect();
  return failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("Verbindungstest abgebrochen:", errorMessage(error));
    process.exit(1);
  });
