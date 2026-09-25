import type { CategoryId, Country } from "@/config/radar.config";
import type { SourceMode } from "@/sources/types";

export interface JudgeProduct {
  externalId: string;
  title: string;
  price: number;
  currency: string;
}

export interface JudgeInput {
  keyword: string;
  country: Country;
  products: JudgeProduct[];
}

export interface Judgment {
  externalId: string;
  /** 0..1 */
  relevance: number;
  category: CategoryId;
  /** kurze Begründung auf Deutsch */
  reason: string;
}

export interface MatchJudge {
  /** Cache-Schlüssel: "claude:<modell>" | "heuristic" */
  readonly id: string;
  readonly mode: SourceMode;
  judge(input: JudgeInput): Promise<Judgment[]>;
}
