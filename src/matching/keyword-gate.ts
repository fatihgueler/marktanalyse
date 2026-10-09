import type { Country } from "@/config/radar.config";
import { ruleCheckKeyword } from "@/scoring/keyword-filter";
import type { KeywordProductClassifier } from "./keyword-classifier";

export interface RejectedKeyword {
  keyword: string;
  by: "regel" | "claude";
  reason: string;
}

export interface KeywordGateResult {
  kept: string[];
  rejected: RejectedKeyword[];
  /** Claude-Prüfung fehlgeschlagen → alle regelkonformen Begriffe bleiben drin */
  claudeError: string | null;
}

/**
 * Zweistufiger Keyword-Filter: erst Regeln (kostenlos), dann – falls gewünscht – ein gebündelter
 * Claude-Aufruf für den Rest. Reihenfolge der behaltenen Begriffe bleibt erhalten (Entdeckungsreihenfolge).
 */
export async function gateKeywords(
  keywords: readonly string[],
  country: Country,
  classifier: KeywordProductClassifier | null,
): Promise<KeywordGateResult> {
  const rejected: RejectedKeyword[] = [];
  const afterRules: string[] = [];
  for (const keyword of keywords) {
    const verdict = ruleCheckKeyword(keyword);
    if (verdict.ok) afterRules.push(keyword);
    else rejected.push({ keyword, by: "regel", reason: verdict.reason });
  }
  if (!classifier || classifier.mode !== "live" || afterRules.length === 0) return { kept: afterRules, rejected, claudeError: null };

  try {
    const verdicts = await classifier.classify(afterRules, country);
    const kept: string[] = [];
    for (const keyword of afterRules) {
      const verdict = verdicts.get(keyword);
      if (!verdict || verdict.isProduct) kept.push(keyword);
      else rejected.push({ keyword, by: "claude", reason: verdict.reason || "kein importierbares Produkt" });
    }
    return { kept, rejected, claudeError: null };
  } catch (error) {
    return { kept: afterRules, rejected, claudeError: error instanceof Error ? error.message : String(error) };
  }
}
