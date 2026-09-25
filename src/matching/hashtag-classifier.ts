import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { effortOption } from "./claude-options";
import { CATEGORY_IDS, radarConfig, type Country, type RadarConfig } from "@/config/radar.config";
import type { CollectEnv } from "@/lib/env";
import type { SourceMode } from "@/sources/types";

export interface HashtagVerdict {
  hashtag: string;
  /** null = kein konkretes Produkt */
  keyword: string | null;
}

export interface HashtagClassifier {
  readonly mode: SourceMode;
  classify(hashtags: string[], country: Country): Promise<HashtagVerdict[]>;
}

const MIN_WORD_LENGTH = 3;

/** Wortschatz der Heuristik: Synonym-Schlüssel und -Werte sowie Kategorie-Schlüsselwörter. */
function buildVocabulary(config: RadarConfig): Set<string> {
  const words = new Set<string>();
  const add = (text: string) => {
    for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (word.length >= MIN_WORD_LENGTH) words.add(word);
  };
  for (const [key, values] of Object.entries(config.matching.synonyms)) {
    add(key);
    values.forEach(add);
  }
  for (const id of CATEGORY_IDS) config.categories[id].keywords.forEach(add);
  return words;
}

/**
 * Zerlegt einen zusammengeschriebenen Hashtag in bekannte Wörter (dynamische Programmierung:
 * maximal abgedeckte Buchstaben, bei Gleichstand weniger, also längere Wörter).
 * „cloudlamp“ → ["cloud", "lamp"]; `coverage` = Anteil der Buchstaben in bekannten Wörtern.
 */
export function segmentHashtag(hashtag: string, vocabulary: Set<string>): { words: string[]; coverage: number } {
  const text = hashtag.toLowerCase().replace(/^#/, "").replace(/[^\p{L}\p{N}]/gu, "");
  const n = text.length;
  if (n === 0) return { words: [], coverage: 0 };
  const maxWordLength = Math.max(...[...vocabulary].map((w) => w.length));
  // best[i]: [abgedeckte Buchstaben, -Anzahl Wörter, Wörter] für das Präfix der Länge i
  const best: { covered: number; count: number; words: string[] }[] = [{ covered: 0, count: 0, words: [] }];
  for (let i = 1; i <= n; i++) {
    const prev = best[i - 1]!;
    let candidate = { covered: prev.covered, count: prev.count, words: prev.words }; // Buchstabe i bleibt unabgedeckt
    for (let length = MIN_WORD_LENGTH; length <= Math.min(maxWordLength, i); length++) {
      const word = text.slice(i - length, i);
      if (!vocabulary.has(word)) continue;
      const base = best[i - length]!;
      const covered = base.covered + length;
      const count = base.count + 1;
      if (covered > candidate.covered || (covered === candidate.covered && count < candidate.count)) {
        candidate = { covered, count, words: [...base.words, word] };
      }
    }
    best[i] = candidate;
  }
  const result = best[n]!;
  return { words: result.words, coverage: result.covered / n };
}

/** Mock-Modus: Hashtag gilt als Produkt, wenn er fast vollständig aus bekannten Produktwörtern besteht. */
export class HeuristicHashtagClassifier implements HashtagClassifier {
  readonly mode = "mock" as const;
  private readonly vocabulary: Set<string>;

  constructor(private readonly config: RadarConfig = radarConfig) {
    this.vocabulary = buildVocabulary(config);
  }

  async classify(hashtags: string[]): Promise<HashtagVerdict[]> {
    const { minCoverage } = this.config.scraping.tiktokHashtags;
    return hashtags.map((hashtag) => {
      const { words, coverage } = segmentHashtag(hashtag, this.vocabulary);
      return { hashtag, keyword: coverage >= minCoverage && words.length > 0 ? words.join(" ") : null };
    });
  }
}

const classificationSchema = z.object({
  hashtags: z.array(z.object({ hashtag: z.string(), is_product: z.boolean(), search_keyword: z.string() })),
});

/** Claude entscheidet, welche Trend-Hashtags konkrete Produkte sind, und formuliert einen Suchbegriff. */
export class ClaudeHashtagClassifier implements HashtagClassifier {
  readonly mode = "live" as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly config: RadarConfig = radarConfig,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async classify(hashtags: string[], country: Country): Promise<HashtagVerdict[]> {
    if (hashtags.length === 0) return [];
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: this.config.matching.maxOutputTokens,
      system:
        "Du hilfst einem Online-Shop für Trendprodukte. Entscheide für jeden TikTok-Trend-Hashtag, ob er ein konkretes, physisches Produkt bezeichnet, das man bei einem Großhändler einkaufen kann (z. B. #cloudlamp, #minithermalprinter). Events, Personen, Marken, Challenges, Sounds und allgemeine Begriffe sind keine Produkte. Für Produkte: search_keyword = kurzer englischer Suchbegriff (2–4 Wörter, Kleinbuchstaben, ohne Marke). Sonst search_keyword = \"\".",
      messages: [{ role: "user", content: `Land: ${country}\nHashtags:\n${hashtags.map((h) => `#${h}`).join("\n")}` }],
      output_config: {
        format: zodOutputFormat(classificationSchema),
        ...effortOption(this.model, this.config),
      },
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      throw new Error("Claude konnte die Hashtags nicht klassifizieren.");
    }
    const byTag = new Map(response.parsed_output.hashtags.map((h) => [h.hashtag.replace(/^#/, "").toLowerCase(), h]));
    return hashtags.map((hashtag) => {
      const verdict = byTag.get(hashtag.toLowerCase());
      const keyword = verdict?.is_product ? verdict.search_keyword.trim().toLowerCase() : "";
      return { hashtag, keyword: keyword || null };
    });
  }
}

export function createHashtagClassifier(env: CollectEnv): HashtagClassifier {
  return env.ANTHROPIC_API_KEY ? new ClaudeHashtagClassifier(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : new HeuristicHashtagClassifier();
}
