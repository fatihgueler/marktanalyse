import { radarConfig } from "@/config/radar.config";
import type { CollectEnv } from "@/lib/env";
import { ClaudeJudge } from "./claude-judge";
import { HeuristicJudge } from "./heuristic-judge";
import type { JudgeInput, Judgment, MatchJudge } from "./types";

export interface JudgmentCache {
  /** bereits bewertete Paare dieses Judges, Schlüssel = externalId */
  load(keyword: string, externalIds: string[], judgeId: string): Promise<Map<string, Judgment>>;
  save(keyword: string, judgeId: string, judgments: Judgment[]): Promise<void>;
}

export interface MatchResult {
  judgments: Map<string, Judgment & { judge: string }>;
  /** Fehler des primären Judges (Heuristik ist dann eingesprungen) */
  error: string | null;
}

/** Claude, wenn ANTHROPIC_API_KEY gesetzt ist, sonst Heuristik (Mock-Modus). */
export function createJudge(env: CollectEnv): MatchJudge {
  return env.ANTHROPIC_API_KEY ? new ClaudeJudge(env.ANTHROPIC_API_KEY, env.ANTHROPIC_MODEL) : new HeuristicJudge();
}

/**
 * Bewertet alle Treffer eines Keywords: zuerst Cache, dann nur die neuen Paare über den Judge.
 * Gecacht werden nur kostenpflichtige Live-Bewertungen; die Heuristik ist gratis und soll
 * Config-Änderungen (Synonyme, Kategorien) sofort widerspiegeln.
 * Schlägt Claude fehl (API-Fehler, Refusal), springt die Heuristik für dieses Keyword ein.
 */
export async function matchProducts(input: JudgeInput, judge: MatchJudge, cache: JudgmentCache): Promise<MatchResult> {
  const useCache = judge.mode === "live";
  const ids = input.products.map((p) => p.externalId);
  const cached = useCache ? await cache.load(input.keyword, ids, judge.id) : new Map<string, Judgment>();
  const judgments = new Map<string, Judgment & { judge: string }>();
  for (const [id, j] of cached) judgments.set(id, { ...j, judge: judge.id });

  const open = input.products.filter((p) => !cached.has(p.externalId));
  if (open.length === 0) return { judgments, error: null };

  let error: string | null = null;
  let fresh: Judgment[] = [];
  try {
    fresh = await judge.judge({ ...input, products: open });
    if (useCache) await cache.save(input.keyword, judge.id, fresh);
    for (const j of fresh) judgments.set(j.externalId, { ...j, judge: judge.id });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  // Lücken (Fehler oder fehlende Einträge) mit der Heuristik füllen – nicht cachen,
  // damit beim nächsten Lauf wieder der primäre Judge versucht wird.
  const missing = open.filter((p) => !judgments.has(p.externalId));
  if (missing.length > 0 && judge.id !== "heuristic") {
    const fallback = new HeuristicJudge(radarConfig);
    for (const j of await fallback.judge({ ...input, products: missing })) {
      judgments.set(j.externalId, { ...j, judge: fallback.id });
    }
  }
  return { judgments, error };
}
