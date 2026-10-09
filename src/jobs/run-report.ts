/**
 * Log-Ausgabe am Ende eines Laufs (collect und rescore): Trichter, Top 10 und Meldungen.
 * Alle drei Abschnitte erscheinen immer – „keine“ ist auch eine Aussage.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { groupCandidates } from "@/lib/candidate-groups";
import { displayTitle } from "@/lib/display-title";
import type { CandidateBreakdown } from "@/scoring/score";

export interface RunMessage {
  level?: "fehler" | "warnung";
  source: string;
  country?: string;
  keyword?: string;
  message: string;
}

export interface Funnel {
  /** gefundene Keywords vor dem Keyword-Filter */
  discovered: number;
  /** davon nach dem Keyword-Filter (= Trendkurven angefragt) */
  keywords: number;
  qualified: number;
  offers: number;
  candidates: number;
}

const MAX_MESSAGES = 15;

/** Karten wie in der Rangliste: ein Eintrag je Produkt und Land, dann nach Keyword/Produkt zusammengeführt. */
export async function countCards(db: PrismaClient, runId: string): Promise<number> {
  const rows = await db.candidateSnapshot.findMany({
    where: { runId },
    distinct: ["productId", "country"],
    orderBy: [{ belowMinMargin: "asc" }, { totalScore: "desc" }],
    select: { id: true, productId: true, keyword: true, country: true, totalScore: true, marginPct: true, trendScore: true, belowMinMargin: true },
  });
  return groupCandidates(rows, "score").length;
}

export function formatFunnel(f: Funnel, cards: number): string {
  return `${f.discovered} Keywords gefunden → ${f.keywords} nach Keyword-Filter → ${f.qualified} mit Trend-Dynamik → ${f.offers} Angebote → ${f.candidates} Kandidaten → ${cards} Karten`;
}

export function printMessages(messages: readonly RunMessage[]): void {
  if (messages.length === 0) {
    console.log("\nMeldungen: keine");
    return;
  }
  console.log(`\nMeldungen (${messages.length}):`);
  for (const e of messages.slice(0, MAX_MESSAGES)) {
    const label = e.level === "warnung" ? "Warnung " : "";
    console.log(`  - ${label}[${e.source}${e.country ? `/${e.country}` : ""}${e.keyword ? ` „${e.keyword}“` : ""}] ${e.message}`);
  }
  if (messages.length > MAX_MESSAGES) console.log(`  … und ${messages.length - MAX_MESSAGES} weitere (im Dashboard unter dem Lauf-Status)`);
}

/** Die 10 besten Kandidaten; solche unter der Mindestmarge stehen hinten und sind markiert. */
export async function printTopCandidates(db: PrismaClient, runId: string): Promise<void> {
  const top = await db.candidateSnapshot.findMany({
    where: { runId },
    distinct: ["productId", "country"],
    orderBy: [{ belowMinMargin: "asc" }, { totalScore: "desc" }],
    take: 10,
    include: { product: { select: { title: true } } },
  });
  if (top.length === 0) {
    console.log("\nTop 10 Kandidaten: keine");
    return;
  }
  console.log("\nTop 10 Kandidaten:");
  for (const [i, c] of top.entries()) {
    const full = displayTitle(c.product.title, c.breakdown as unknown as CandidateBreakdown);
    const title = full.length > 48 ? `${full.slice(0, 47)}…` : full;
    console.log(
      `${String(i + 1).padStart(2)}. ${c.totalScore.toFixed(1).padStart(5)}  ${c.country}  ${title.padEnd(48)}  Marge ${Number(c.marginAbs).toFixed(2)} ${c.currency} (${(c.marginPct * 100).toFixed(0)} %)${c.belowMinMargin ? "  [Marge zu dünn]" : ""}`,
    );
  }
}
