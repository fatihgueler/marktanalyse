/** Stufen der Merkliste in ihrer Reihenfolge (Prisma-Enum PipelineStage) */
export const STAGES = ["IDEE", "GEPRUEFT", "TEST_DROP", "ERGEBNIS"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  IDEE: "Idee",
  GEPRUEFT: "Geprüft",
  TEST_DROP: "Test-Drop",
  ERGEBNIS: "Ergebnis",
};
