import type { CandidateBreakdown } from "@/scoring/score";

/** Lesbarer Produkttitel: die deutsche Übersetzung (1688-Titel sind chinesisch), sonst der Originaltitel. */
export function displayTitle(originalTitle: string, breakdown: Pick<CandidateBreakdown, "offer"> | null | undefined): string {
  return breakdown?.offer?.titleDe?.trim() || originalTitle;
}
