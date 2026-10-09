import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { effortOption } from "./claude-options";
import { radarConfig, type Country, type RadarConfig } from "@/config/radar.config";
import type { CollectEnv } from "@/lib/env";
import type { SourceMode } from "@/sources/types";

export interface OfferTitle {
  externalId: string;
  title: string;
}

export interface TranslatedOffer {
  /** kurzer deutscher Produktname; null = nicht übersetzt (Originaltitel anzeigen) */
  titleDe: string | null;
  /** Google-Shopping-Suchbegriff für genau dieses Produkt in der Landessprache; null = Keyword nutzen */
  productQuery: string | null;
}

/**
 * Übersetzt Angebotstitel (1688: Chinesisch) und bildet je Angebot einen Shopping-Suchbegriff,
 * damit der Referenzpreis zum konkreten Produkt passt statt zum allgemeinen Keyword.
 */
export interface OfferTitleTranslator {
  readonly mode: SourceMode;
  translate(offers: OfferTitle[], keyword: string, country: Country): Promise<Map<string, TranslatedOffer>>;
}

/** Ohne Claude: keine Übersetzung, Shopping sucht mit dem Keyword (wie bisher). */
export class NoopTitleTranslator implements OfferTitleTranslator {
  readonly mode = "mock" as const;

  async translate(offers: OfferTitle[]): Promise<Map<string, TranslatedOffer>> {
    return new Map(offers.map((o) => [o.externalId, { titleDe: null, productQuery: null }]));
  }
}

const translationSchema = z.object({
  offers: z.array(z.object({ id: z.string(), title_de: z.string(), product_query: z.string() })),
});

export class ClaudeTitleTranslator implements OfferTitleTranslator {
  readonly mode = "live" as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly config: RadarConfig = radarConfig,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async translate(offers: OfferTitle[], keyword: string, country: Country): Promise<Map<string, TranslatedOffer>> {
    if (offers.length === 0) return new Map();
    const language = this.config.countries[country].serpLanguage === "de" ? "Deutsch" : "Englisch";
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: this.config.matching.maxOutputTokens,
      system:
        "Du bereitest Großhandelsangebote (Titel oft auf Chinesisch) für einen deutschen Online-Shop auf. Für jedes Angebot: " +
        "title_de = kurzer deutscher Produktname, 2–8 Wörter, ohne Werbefloskeln, Mengen- und Großhandelsangaben. " +
        `product_query = Google-Shopping-Suchbegriff auf ${language}, mit dem Endkunden genau dieses Produkt finden (2–5 Wörter, Kleinbuchstaben, ohne Marke). ` +
        "Gib im Feld id die Angebots-ID unverändert zurück.",
      messages: [
        {
          role: "user",
          content: `Suchbegriff: ${keyword}\nLand: ${country}\nAngebote:\n${offers.map((o) => `${o.externalId}: ${o.title}`).join("\n")}`,
        },
      ],
      output_config: { format: zodOutputFormat(translationSchema), ...effortOption(this.model, this.config) },
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("Claude konnte die Angebotstitel nicht übersetzen.");
    const byId = new Map(response.parsed_output.offers.map((o) => [o.id.trim(), o]));
    return new Map(
      offers.map((o) => {
        const t = byId.get(o.externalId);
        return [o.externalId, { titleDe: t?.title_de.trim() || null, productQuery: t?.product_query.trim().toLowerCase() || null }];
      }),
    );
  }
}

export function createTitleTranslator(env: CollectEnv): OfferTitleTranslator {
  return env.ANTHROPIC_API_KEY ? new ClaudeTitleTranslator(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : new NoopTitleTranslator();
}
