import { radarConfig, type RadarConfig } from "@/config/radar.config";

/** Günstigstes Modell mit Structured Outputs – Standard für Matching, Hashtags und Übersetzung. */
export const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5";

/**
 * `effort` nur für Modelle, die ihn unterstützen – Haiku 4.5 lehnt den Parameter mit HTTP 400 ab.
 * Rückgabe wird in `output_config` eingemischt.
 */
export function effortOption(model: string, config: RadarConfig = radarConfig): { effort?: "low" | "medium" | "high" } {
  const { effort, modelsWithoutEffort } = config.matching;
  if (!effort || modelsWithoutEffort.some((prefix) => model.startsWith(prefix))) return {};
  return { effort };
}
