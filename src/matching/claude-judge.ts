import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORY_IDS, radarConfig, type RadarConfig } from "@/config/radar.config";
import { clamp } from "@/lib/stats";
import type { JudgeInput, Judgment, MatchJudge } from "./types";

// Structured Output: kein min/max im Schema (nicht von allen Modellen unterstützt) – wir clampen danach.
const judgmentSchema = z.object({
  matches: z.array(
    z.object({
      product_id: z.string(),
      relevance: z.number(),
      category: z.enum(CATEGORY_IDS),
      reason: z.string(),
    }),
  ),
});

function buildSystemPrompt(config: RadarConfig): string {
  const categories = CATEGORY_IDS.map((id) => `- ${id}: ${config.categories[id].label}`).join("\n");
  return `Du bewertest für einen Online-Shop (limitierte Drops mit Trendprodukten aus Asien, Zielmarkt DACH/UK), ob Lieferanten-Angebote zu einem aktuell steigenden Suchbegriff passen.

Für jedes Produkt:
- relevance (0 bis 1): Wie gut ist das Produkt genau das, was jemand kaufen will, der nach dem Suchbegriff sucht?
  1.0 = exakt dieses Produkt; 0.7 = passende Variante; 0.3 = Zubehör, Ersatzteil oder nur thematisch verwandt; 0 = anderes Produkt, das nur ein Wort teilt.
- category: genau eine ID aus dieser Liste:
${categories}
- reason: ein kurzer deutscher Satz, warum die Relevanz so ist.

Gib für jedes übergebene Produkt genau einen Eintrag mit seiner product_id zurück.`;
}

/** Claude bewertet alle Treffer eines Keywords in einem Request (spart Kosten ggü. einem Request je Produkt). */
export class ClaudeJudge implements MatchJudge {
  readonly id: string;
  readonly mode = "live" as const;
  private readonly client: Anthropic;
  private readonly systemPrompt: string;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly config: RadarConfig = radarConfig,
  ) {
    this.id = `claude:${model}`;
    this.client = new Anthropic({ apiKey });
    this.systemPrompt = buildSystemPrompt(config);
  }

  async judge(input: JudgeInput): Promise<Judgment[]> {
    if (input.products.length === 0) return [];
    const productList = input.products
      .map((p) => `- product_id: ${p.externalId} | ${p.title} | ${p.price.toFixed(2)} ${p.currency}`)
      .join("\n");

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: this.config.matching.maxOutputTokens,
      system: this.systemPrompt,
      messages: [
        {
          role: "user",
          content: `Suchbegriff: "${input.keyword}" (Land: ${input.country})\n\nProdukte:\n${productList}`,
        },
      ],
      output_config: {
        format: zodOutputFormat(judgmentSchema),
        ...(this.config.matching.effort ? { effort: this.config.matching.effort } : {}),
      },
    });

    if (response.stop_reason === "refusal") {
      throw new Error(`Claude hat die Bewertung für "${input.keyword}" abgelehnt (refusal).`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error(`Claude-Antwort für "${input.keyword}" abgeschnitten (max_tokens) – matching.maxOutputTokens erhöhen.`);
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`Claude-Antwort für "${input.keyword}" nicht auswertbar.`);

    const knownIds = new Set(input.products.map((p) => p.externalId));
    return parsed.matches
      .filter((m) => knownIds.has(m.product_id))
      .map((m) => ({
        externalId: m.product_id,
        relevance: clamp(m.relevance, 0, 1),
        category: m.category,
        reason: m.reason.trim(),
      }));
  }
}
