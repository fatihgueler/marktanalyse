import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { radarConfig } from "@/config/radar.config";

const translationSchema = z.object({ keyword_zh: z.string() });

/**
 * Übersetzt Suchbegriffe ins Chinesische für die 1688-Suche (1688 findet mit deutschen oder
 * englischen Begriffen kaum etwas). Ergebnisse werden je Lauf zwischengespeichert.
 */
export class ClaudeKeywordTranslator {
  private readonly client: Anthropic;
  private readonly cache = new Map<string, string>();

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async toChinese(keyword: string): Promise<string> {
    const cached = this.cache.get(keyword);
    if (cached) return cached;
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 200,
      system:
        "Übersetze den Produkt-Suchbegriff in den vereinfacht-chinesischen Begriff, unter dem Großhändler auf 1688.com dieses Produkt führen. Nur der Suchbegriff, keine Marke, 2–8 Zeichen.",
      messages: [{ role: "user", content: keyword }],
      output_config: {
        format: zodOutputFormat(translationSchema),
        ...(radarConfig.matching.effort ? { effort: radarConfig.matching.effort } : {}),
      },
    });
    const translated = response.parsed_output?.keyword_zh.trim();
    if (response.stop_reason === "refusal" || !translated) throw new Error(`Übersetzung von „${keyword}“ fehlgeschlagen.`);
    this.cache.set(keyword, translated);
    return translated;
  }
}
