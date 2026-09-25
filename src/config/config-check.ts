import { createHash } from "node:crypto";
import { radarConfig, type RadarConfig } from "./radar.config";

const WEIGHT_TOLERANCE = 1e-9;

function assertWeightsSumToOne(name: string, weights: Record<string, number>): void {
  const sum = Object.values(weights).reduce((acc, w) => acc + w, 0);
  if (Math.abs(sum - 1) > WEIGHT_TOLERANCE) {
    throw new Error(`Config: Gewichte in "${name}" summieren sich zu ${sum}, erwartet 1.`);
  }
  for (const [key, w] of Object.entries(weights)) {
    if (w < 0) throw new Error(`Config: Gewicht "${name}.${key}" ist negativ.`);
  }
}

/** Prüft die Config auf innere Widersprüche. Wirft bei Fehlern, bevor ein Lauf startet. */
export function validateConfig(config: RadarConfig = radarConfig): void {
  assertWeightsSumToOne("trend.weights", config.trend.weights);
  assertWeightsSumToOne("competition.weights", config.competition.weights);
  assertWeightsSumToOne("score.weights", config.score.weights);

  const { minMarginPct, targetMarginPct } = config.margin;
  if (!(targetMarginPct > minMarginPct)) {
    throw new Error("Config: margin.targetMarginPct muss größer als margin.minMarginPct sein.");
  }
  if (config.trend.recentWeeks + config.trend.previousWeeks >= config.trend.minSeriesWeeks) {
    throw new Error("Config: trend.minSeriesWeeks muss größer als recentWeeks + previousWeeks sein.");
  }
  for (const [currency, rate] of Object.entries(config.fx)) {
    if (!(rate > 0)) throw new Error(`Config: Wechselkurs ${currency} muss > 0 sein.`);
  }
}

/** Kurzer, stabiler Hash der Config – wird pro Lauf gespeichert. */
export function configVersion(config: RadarConfig = radarConfig): string {
  return createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 12);
}
