import { CATEGORY_IDS, radarConfig, type CategoryId, type RadarConfig } from "@/config/radar.config";
import type { JudgeInput, Judgment, MatchJudge } from "./types";

const ACCESSORY_PENALTY = 0.5;

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFC");
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Trifft, wenn `term` im Titel an einer Wortgrenze beginnt („lamp“ trifft „lamps“, nicht „clamp“). */
function containsTerm(title: string, term: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}`, "u").test(title);
}

/**
 * Zerlegt ein Keyword-Token in bekannte Bestandteile (längste zuerst, ohne Überlappung):
 * „wolkenlampe“ → ["wolken", "lampe"]. Ohne bekannte Bestandteile bleibt das Token selbst.
 */
function splitCompound(token: string, synonymKeys: string[]): string[] {
  const covered = new Array<boolean>(token.length).fill(false);
  const parts: { index: number; key: string }[] = [];
  for (const key of synonymKeys) {
    let from = 0;
    while (from <= token.length - key.length) {
      const index = token.indexOf(key, from);
      if (index === -1) break;
      const free = covered.slice(index, index + key.length).every((c) => !c);
      if (free) {
        covered.fill(true, index, index + key.length);
        parts.push({ index, key });
      }
      from = index + 1;
    }
  }
  if (parts.length === 0) return [token];
  return parts.sort((a, b) => a.index - b.index).map((p) => p.key);
}

/**
 * Mock-Modus ohne ANTHROPIC_API_KEY: Relevanz = Anteil der Keyword-Bestandteile, die (direkt oder
 * als Übersetzung) im Produkttitel vorkommen; Zubehör-Titel werden abgewertet.
 */
export class HeuristicJudge implements MatchJudge {
  readonly id = "heuristic";
  readonly mode = "mock" as const;
  private readonly synonymKeys: string[];

  constructor(private readonly config: RadarConfig = radarConfig) {
    this.synonymKeys = Object.keys(config.matching.synonyms).sort((a, b) => b.length - a.length);
  }

  async judge(input: JudgeInput): Promise<Judgment[]> {
    return input.products.map((product) => this.judgeOne(input.keyword, product.externalId, product.title));
  }

  judgeOne(keyword: string, externalId: string, title: string): Judgment {
    const { synonyms, stopwords, accessoryMarkers } = this.config.matching;
    const normalizedTitle = normalize(title);
    const normalizedKeyword = normalize(keyword);

    const parts = tokenize(keyword)
      .filter((token) => !stopwords.includes(token))
      .flatMap((token) => splitCompound(token, this.synonymKeys));

    const matched: string[] = [];
    const missing: string[] = [];
    for (const part of parts) {
      const terms = [part, ...(synonyms[part] ?? [])];
      const hit = terms.find((term) => containsTerm(normalizedTitle, term));
      if (hit) matched.push(hit);
      else missing.push(part);
    }

    // Quadriert: Nur wenn (fast) alle Bestandteile vorkommen, reicht es für die Relevanzschwelle.
    // Ein Titel, der nur ein Wort mit dem Keyword teilt („Cloud Shaped Pillow“), fällt heraus.
    const share = parts.length > 0 ? matched.length / parts.length : 0;
    let relevance = share ** 2;
    const titleTokens = tokenize(title);
    const leadingTitle = titleTokens.slice(0, Math.ceil(titleTokens.length / 2)).join(" ");
    const notInKeyword = (marker: string) => !normalizedKeyword.includes(marker);
    const accessory =
      accessoryMarkers.anywhere.find((m) => containsTerm(normalizedTitle, m) && notInKeyword(m)) ??
      accessoryMarkers.leading.find((m) => containsTerm(leadingTitle, m) && notInKeyword(m));
    if (accessory) relevance *= ACCESSORY_PENALTY;

    const reasonParts = [`Heuristik: ${matched.length} von ${parts.length} Begriffen im Titel`];
    if (matched.length > 0) reasonParts.push(`gefunden: ${matched.join(", ")}`);
    if (missing.length > 0) reasonParts.push(`fehlt: ${missing.join(", ")}`);
    if (accessory) reasonParts.push(`vermutlich Zubehör („${accessory}“)`);

    // Kategorie zuerst aus dem Keyword (inkl. Übersetzungen) – so bekommen alle Angebote eines
    // Keywords dieselbe Kategorie; nur ohne Treffer entscheidet zusätzlich der Titel.
    const keywordTerms = [normalizedKeyword, ...parts.flatMap((part) => synonyms[part] ?? [])].join(" ");
    const keywordCategory = this.categorize(keywordTerms);
    const category = keywordCategory !== "sonstiges" ? keywordCategory : this.categorize(`${normalizedKeyword} ${normalizedTitle}`);

    return { externalId, relevance, category, reason: `${reasonParts.join("; ")}.` };
  }

  /** Kategorie mit den meisten Schlüsselwort-Treffern; ohne Treffer „sonstiges“. */
  private categorize(text: string): CategoryId {
    let best: CategoryId = "sonstiges";
    let bestHits = 0;
    for (const id of CATEGORY_IDS) {
      const hits = this.config.categories[id].keywords.filter((kw) => containsTerm(text, kw)).length;
      if (hits > bestHits) {
        best = id;
        bestHits = hits;
      }
    }
    return best;
  }
}
