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
    return { label: "TikTok-Popularität", note: "TikTok Creative Center (Scraping), Hashtag-Popularität, 100 = Höchstwert im Zeitraum" };
  }
  return { label: "Suchinteresse", note: "Google Trends, relativ (100 = Höchstwert im Zeitraum)" };
}
