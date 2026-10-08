import type { RunSourceMode } from "./types";

const TREND_SOURCES = ["google-trends", "tiktok-trends", "pinterest-trends"];
export const SUPPLY_SOURCES = ["aliexpress", "alibaba-1688"];

/** Echtbetrieb = mindestens eine Trend- oder Angebotsquelle lief live (sonst Demo-Lauf). */
export function isLiveOperation(modes: Record<string, RunSourceMode | string>): boolean {
  return [...TREND_SOURCES, ...SUPPLY_SOURCES].some((id) => modes[id] === "live");
}

/**
 * Hinweise zum Echtbetrieb mit unvollständigen Keys. Demo-Quellen sind dann abgeschaltet
 * (siehe `createSources`); die Hinweise sagen, welches Signal deshalb fehlt und welcher Key hilft.
 */
export function mixedModeWarnings(modes: Record<string, RunSourceMode>): string[] {
  const live = (id: string) => modes[id] === "live";
  const anyTrendLive = TREND_SOURCES.some(live);
  const anySupplyLive = SUPPLY_SOURCES.some(live);
  if (!anyTrendLive && !anySupplyLive) return [];

  const warnings: string[] = [];
  if (anyTrendLive && !anySupplyLive) {
    warnings.push("Trends sind live, aber keine Angebotsquelle – es entstehen keine Kandidaten. AliExpress-Keys setzen.");
  }
  if (anySupplyLive && !anyTrendLive) {
    warnings.push("Angebote sind live, aber keine Trendquelle – es entstehen keine Kandidaten. SERPAPI_API_KEY oder Pinterest-Zugang setzen.");
  }
  if (!live("google-shopping")) {
    warnings.push("Keine echten Verkaufspreise – Margen sind nur per Kategorie-Faktor geschätzt. SERPAPI_API_KEY setzen.");
  }
  if (!live("claude")) {
    warnings.push("Matching läuft ohne Claude (Heuristik) – mehr Fehlzuordnungen; 1688 wird ohne Übersetzung übersprungen. ANTHROPIC_API_KEY empfohlen.");
  }
  return warnings;
}

/**
 * Grund, warum ein Echtbetrieb-Lauf keine Kandidaten liefern kann – dann wird er gar nicht erst
 * gestartet, damit keine bezahlten Suchen verfallen. null = Lauf ist sinnvoll.
 * 1688 zählt nur mit Claude, weil die Suche eine chinesische Übersetzung braucht.
 */
export function unusableLiveRunReason(modes: Record<string, RunSourceMode>): string | null {
  const live = (id: string) => modes[id] === "live";
  const anyTrendLive = TREND_SOURCES.some(live);
  const anySupplyLive = SUPPLY_SOURCES.some(live);
  if (!anyTrendLive && !anySupplyLive) return null;
  if (!anyTrendLive) return "Keine Trendquelle ist live (SERPAPI_API_KEY, Pinterest oder APIFY_TOKEN fehlen).";
  const usableSupply = live("aliexpress") || (live("alibaba-1688") && live("claude"));
  if (!usableSupply) {
    return live("alibaba-1688")
      ? "Einzige Angebotsquelle ist 1688, und die braucht ANTHROPIC_API_KEY für die Übersetzung. AliExpress-Keys oder ANTHROPIC_API_KEY setzen."
      : "Keine Angebotsquelle ist live. AliExpress-Keys setzen.";
  }
  return null;
}
