import { radarConfig, type RadarConfig } from "@/config/radar.config";

type FilterConfig = RadarConfig["keywordFilter"];

export type RuleVerdict = { ok: true } | { ok: false; reason: string };

const CJK = /[㐀-鿿]/;

/** Kleinbuchstaben, Satzzeichen zu Leerzeichen (außer &), mit Rand-Leerzeichen für Ganzwort-Vergleiche. */
function normalize(text: string): string {
  return ` ${text.toLowerCase().replace(/[^\p{L}\p{N}&㐀-鿿]+/gu, " ").replace(/\s+/g, " ").trim()} `;
}

/**
 * Erster Begriff der Liste, der im Text vorkommt: lateinische Begriffe als ganze Wörter bzw.
 * Wortfolgen („philips hue“ trifft „philips hue lampe“, „test“ nicht „testo“), chinesische als Teilstring.
 */
export function findTerm(text: string, terms: readonly string[]): string | null {
  const haystack = normalize(text);
  for (const term of terms) {
    if (CJK.test(term)) {
      if (text.includes(term)) return term;
      continue;
    }
    const needle = normalize(term);
    if (needle.trim() && haystack.includes(needle)) return term;
  }
  return null;
}

/** Lizenzware im Text (Keyword oder Angebotstitel, auch chinesisch)? Liefert den Treffer. */
export function licenseHit(text: string, config: FilterConfig = radarConfig.keywordFilter): string | null {
  return findTerm(text, config.licenses);
}

/**
 * Regelbasierter Keyword-Filter (kostenlos, vor Claude): Marken/Händler, Fragen, Selbermachen,
 * Tests/Vergleiche, Gutscheine/Konten/Läden, Filme/Spiele und Lizenzware. Der Grund steht im Log.
 */
export function ruleCheckKeyword(keyword: string, config: FilterConfig = radarConfig.keywordFilter): RuleVerdict {
  const firstWord = normalize(keyword).trim().split(" ")[0] ?? "";
  if (config.questionWords.includes(firstWord)) return { ok: false, reason: `Frage („${firstWord} …“)` };
  const checks: [readonly string[], string][] = [
    [config.licenses, "Lizenzware"],
    [config.brands, "Marke/Händler"],
    [config.diy, "Selbermachen/Ideen"],
    [config.reviewCompare, "Test/Vergleich"],
    [config.dealsAccounts, "Gutschein/Konto/Laden"],
    [config.media, "Film/Serie/Spiel"],
  ];
  for (const [terms, label] of checks) {
    const hit = findTerm(keyword, terms);
    if (hit) return { ok: false, reason: `${label}: ${hit}` };
  }
  return { ok: true };
}
