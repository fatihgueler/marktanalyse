import { radarConfig, type RadarConfig } from "@/config/radar.config";

/**
 * Günstigstes aktuelles Modell mit Structured Outputs – Standard für Matching, Hashtags und Übersetzung.
 * Haiku 5.5 denkt standardmäßig mit (adaptiv); die Denktiefe steuert `matching.effort`, und die Denk-Tokens
 * zählen zu `max_tokens` – deshalb sind die Grenzen großzügig.
 */
export const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";

/**
 * `effort` nur für Modelle, die ihn unterstützen – Haiku 4.5 lehnt den Parameter mit HTTP 400 ab
 * (falls jemand per ANTHROPIC_MODEL zurückwechselt).
 * Rückgabe wird in `output_config` eingemischt.
 */
export function effortOption(model: string, config: RadarConfig = radarConfig): { effort?: "low" | "medium" | "high" } {
  const { effort, modelsWithoutEffort } = config.matching;
  if (!effort || modelsWithoutEffort.some((prefix) => model.startsWith(prefix))) return {};
  return { effort };
}
