/** Anzeigenamen der Quellen-IDs (siehe `id` der Adapter). */
export const SOURCE_LABELS: Record<string, string> = {
  "google-trends": "Google Trends",
  aliexpress: "AliExpress",
  "google-shopping": "Google Shopping",
  "config-multiplikator": "Schätzung (Kategorie-Faktor)",
  claude: "Claude-Matching",
};

export function sourceLabel(id: string): string {
  return SOURCE_LABELS[id] ?? id;
}

export function judgeLabel(judge: string): string {
  if (judge === "heuristic") return "Heuristik (Demo)";
  if (judge.startsWith("claude:")) return `Claude · ${judge.slice("claude:".length)}`;
  return judge;
}
