import { radarConfig, type RadarConfig } from "@/config/radar.config";
import { mean } from "@/lib/stats";

export type Verdict = "TOP" | "OK" | "FLOP";

export interface CalibrationRow {
  verdict: Verdict;
  /** Teil-Scores 0..1 und Gesamtscore 0..100 zum Zeitpunkt der Drop-Entscheidung */
  trend: number;
  margin: number;
  competition: number;
  total: number;
  /** Marktdynamik der Werbung (relatives Wachstum) oder null, wenn unbekannt/neu */
  adMomentum: number | null;
}

export type SignalKey = "trend" | "margin" | "competition" | "total" | "adMomentum";

export interface SignalStat {
  key: SignalKey;
  topMean: number | null;
  flopMean: number | null;
  /** Top − Flop auf 0..1-Skala (Gesamtscore durch 100 geteilt); null bei zu wenig Daten */
  difference: number | null;
  assessment: "trennt gut" | "trennt schwach" | "trennt nicht" | "umgekehrt" | "zu wenige Daten";
}

export interface CalibrationResult {
  counts: Record<Verdict, number>;
  enoughData: boolean;
  signals: SignalStat[];
}

const SIGNALS: SignalKey[] = ["trend", "margin", "competition", "total", "adMomentum"];

function valueOf(row: CalibrationRow, key: SignalKey): number | null {
  if (key === "total") return row.total / 100;
  return row[key];
}

/**
 * Vergleicht die Signale zwischen Top- und Flop-Drops. Ein Signal „trennt gut“, wenn Top-Drops
 * im Mittel deutlich höher lagen. „Umgekehrt“ heißt: Flops hatten höhere Werte – ein Hinweis,
 * dass das Gewicht zu hoch ist oder das Vorzeichen nicht stimmt (z. B. bei der Werbe-Dynamik).
 * Bewusst keine automatische Gewichtsänderung – die Entscheidung bleibt bei euch.
 */
export function calibrationStats(rows: readonly CalibrationRow[], config: RadarConfig["calibration"] = radarConfig.calibration): CalibrationResult {
  const counts: Record<Verdict, number> = { TOP: 0, OK: 0, FLOP: 0 };
  for (const row of rows) counts[row.verdict]++;
  const top = rows.filter((r) => r.verdict === "TOP");
  const flop = rows.filter((r) => r.verdict === "FLOP");
  const enoughData = top.length >= config.minPerGroup && flop.length >= config.minPerGroup;

  const signals = SIGNALS.map((key): SignalStat => {
    const topValues = top.map((r) => valueOf(r, key)).filter((v): v is number => v !== null);
    const flopValues = flop.map((r) => valueOf(r, key)).filter((v): v is number => v !== null);
    const topMean = topValues.length > 0 ? mean(topValues) : null;
    const flopMean = flopValues.length > 0 ? mean(flopValues) : null;
    if (topValues.length < config.minPerGroup || flopValues.length < config.minPerGroup || topMean === null || flopMean === null) {
      return { key, topMean, flopMean, difference: null, assessment: "zu wenige Daten" };
    }
    const difference = topMean - flopMean;
    const assessment =
      difference >= config.strongDifference
        ? "trennt gut"
        : difference >= config.weakDifference
          ? "trennt schwach"
          : difference > -config.weakDifference
            ? "trennt nicht"
            : "umgekehrt";
    return { key, topMean, flopMean, difference, assessment };
  });

  return { counts, enoughData, signals };
}
