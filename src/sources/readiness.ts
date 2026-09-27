import type { SourceMode } from "./types";

const TREND_SOURCES = ["google-trends", "tiktok-trends"];
const SUPPLY_SOURCES = ["aliexpress", "alibaba-1688"];

/**
 * Erkennt Mischbetrieb, bei dem echte und Demo-Daten zusammen gescort würden. Solche Läufe
 * funktionieren technisch, ihre Rangliste ist aber nicht verwertbar – z. B. echte Keywords
 * gegen Demo-Angebote oder echte Angebote mit Demo-Referenzpreisen.
 */
export function mixedModeWarnings(modes: Record<string, SourceMode>): string[] {
  const live = (id: string) => modes[id] === "live";
  const anyTrendLive = TREND_SOURCES.some(live);
  const anySupplyLive = SUPPLY_SOURCES.some(live);
  if (!anyTrendLive && !anySupplyLive) return [];

  const warnings: string[] = [];
  if (anyTrendLive && !anySupplyLive) {
    warnings.push("Trends sind live, Angebote noch Demo – Kandidaten mischen echte Keywords mit Demo-Produkten. AliExpress-Keys setzen.");
  }
  if (anySupplyLive && !anyTrendLive) {
    warnings.push("Angebote sind live, Trends noch Demo – gesucht wird nur nach Demo-Keywords. SERPAPI_API_KEY setzen.");
  }
  if (!live("google-shopping")) {
    warnings.push("Referenzpreise sind Demo-Werte – Margen und Score sind nicht verwertbar. SERPAPI_API_KEY setzen.");
  }
  if (!live("claude")) {
    warnings.push("Matching läuft ohne Claude (Heuristik) – mehr Fehlzuordnungen; 1688 wird ohne Übersetzung übersprungen. ANTHROPIC_API_KEY empfohlen.");
  }
  return warnings;
}
