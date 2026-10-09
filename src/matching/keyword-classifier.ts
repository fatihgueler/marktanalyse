import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { effortOption } from "./claude-options";
import { radarConfig, type Country, type RadarConfig } from "@/config/radar.config";
import type { CollectEnv } from "@/lib/env";
import type { SourceMode } from "@/sources/types";

export interface KeywordVerdict {
  isProduct: boolean;
  reason: string;
}

/** Entscheidet je Suchbegriff: konkretes, physisches, importierbares Produkt ja/nein. */
export interface KeywordProductClassifier {
  readonly mode: SourceMode;
  classify(keywords: string[], country: Country): Promise<Map<string, KeywordVerdict>>;
}

/** Ohne Claude: keine Prüfung, alle Begriffe gelten als Produkt (nur der Regelfilter wirkt). */
export class PassThroughKeywordClassifier implements KeywordProductClassifier {
  readonly mode = "mock" as const;

  async classify(keywords: string[]): Promise<Map<string, KeywordVerdict>> {
    return new Map(keywords.map((k) => [k, { isProduct: true, reason: "ohne Claude nicht geprüft" }]));
  }
}

const verdictSchema = z.object({
  keywords: z.array(z.object({ keyword: z.string(), is_product: z.boolean(), reason: z.string() })),
});

const SYSTEM_PROMPT =
  "Du prüfst Google-Suchbegriffe für einen Online-Shop, der Trendprodukte bei Großhändlern in China einkauft und in Deutschland, Österreich, der Schweiz und Großbritannien verkauft. " +
  "Entscheide für jeden Begriff: Bezeichnet er ein konkretes, physisches Produkt, das man als Ware importieren und verkaufen kann (z. B. „wolkenlampe“, „mini thermodrucker“, „led maske gesicht“)? " +
  "NEIN bei: Marken- oder Händlernamen und deren Sortiment, Personen, Bands, Filmen, Serien, Spielen, Apps und Software, Dienstleistungen, Lebensmitteln, Pflanzen und Tieren, " +
  "Orten, Ereignissen, Wetter, Rezepten, Anleitungen, Fragen, Rätseln, Tests und Vergleichen sowie bei zu allgemeinen Begriffen ohne erkennbares Produkt. " +
  "Saisonale Deko zählt als Produkt. reason: höchstens 8 Wörter auf Deutsch. Gib im Feld keyword den Begriff unverändert zurück.";

/** Claude prüft die Begriffe gebündelt (ein Aufruf je `claudeBatchSize` Begriffe). */
export class ClaudeKeywordClassifier implements KeywordProductClassifier {
  readonly mode = "live" as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly config: RadarConfig = radarConfig,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async classify(keywords: string[], country: Country): Promise<Map<string, KeywordVerdict>> {
    const result = new Map<string, KeywordVerdict>();
    const size = this.config.keywordFilter.claudeBatchSize;
    for (let i = 0; i < keywords.length; i += size) {
      const batch = keywords.slice(i, i + size);
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: this.config.matching.maxOutputTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Land: ${country}\nBegriffe:\n${batch.join("\n")}` }],
        output_config: { format: zodOutputFormat(verdictSchema), ...effortOption(this.model, this.config) },
      });
      if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("Claude konnte die Suchbegriffe nicht prüfen.");
      const byKeyword = new Map(response.parsed_output.keywords.map((v) => [v.keyword.trim().toLowerCase(), v]));
      for (const keyword of batch) {
        const verdict = byKeyword.get(keyword.toLowerCase());
        // Fehlt ein Begriff in der Antwort, bleibt er drin – lieber eine Suche zu viel als ein Produkt zu wenig.
        result.set(keyword, verdict ? { isProduct: verdict.is_product, reason: verdict.reason.trim() } : { isProduct: true, reason: "nicht beantwortet" });
      }
    }
    return result;
  }
}

export function createKeywordClassifier(env: CollectEnv): KeywordProductClassifier {
  return env.ANTHROPIC_API_KEY ? new ClaudeKeywordClassifier(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : new PassThroughKeywordClassifier();
}
