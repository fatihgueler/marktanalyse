/** Anzeigenamen der Quellen-IDs (siehe `id` der Adapter). */
export const SOURCE_LABELS: Record<string, string> = {
  "google-trends": "Google Trends",
  aliexpress: "AliExpress",
  "google-shopping": "Google Shopping",
  "config-multiplikator": "Schätzung (Kategorie-Faktor)",
  claude: "Claude-Matching",
  "meta-ad-library": "Meta Ad Library",
  "tiktok-ads": "TikTok Ad Library",
  "tiktok-trends": "TikTok Creative Center",
  "alibaba-1688": "1688",
  betrieb: "Betrieb",
  "pinterest-trends": "Pinterest Trends",
  // nur noch für ältere Läufe, eBay ist seit Oktober 2026 keine Quelle mehr
  ebay: "eBay",
  "ezb-kurse": "EZB-Kurse",
};

export function sourceLabel(id: string): string {
  return SOURCE_LABELS[id] ?? id;
}

export function judgeLabel(judge: string): string {
  if (judge === "heuristic") return "Heuristik (Demo)";
  if (judge.startsWith("claude:")) return `Claude · ${judge.slice("claude:".length)}`;
  return judge;
}

/** Was die Trendkurve einer Quelle misst – für Überschriften und Screenreader-Texte. */
export function demandMetric(source: string): { label: string; note: string } {
  if (source === "tiktok-trends") {
    // Seit 10/2026: Produkt aus TikTok-Top-Anzeigen, Kurve von Google Trends (Demo-Daten: Hashtag-Popularität)
    return { label: "Suchinteresse (Produkt aus TikTok-Anzeige)", note: "Google Trends zu einem Produkt, das im TikTok Creative Center beworben wird; 100 = Höchstwert im Zeitraum" };
  }
  if (source === "pinterest-trends") {
    return { label: "Pinterest-Suchinteresse", note: "Pinterest Trends, relatives Suchvolumen (100 = Höchstwert im Zeitraum)" };
  }
  return { label: "Suchinteresse", note: "Google Trends, relativ (100 = Höchstwert im Zeitraum)" };
}
