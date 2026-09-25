"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export interface DropFormState {
  error: string | null;
  saved: boolean;
}

const MAX_NOTE_LENGTH = 500;

const dropSchema = z.object({
  candidateSnapshotId: z.string().min(1),
  droppedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum fehlt oder ist ungültig.")
    .refine((value) => new Date(`${value}T00:00:00Z`).getTime() <= Date.now(), "Das Drop-Datum liegt in der Zukunft."),
  unitsSold: z
    .string()
    .transform((v) => (v.trim() === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0), "Verkaufte Stück: ganze Zahl ≥ 0."),
  returnRatePercent: z
    .string()
    .transform((v) => (v.trim() === "" ? null : Number(v.replace(",", "."))))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100), "Retourenquote: 0 bis 100 %."),
  verdict: z.enum(["TOP", "OK", "FLOP"], { message: "Bitte ein Urteil wählen." }),
  note: z.string().max(MAX_NOTE_LENGTH, `Notiz: höchstens ${MAX_NOTE_LENGTH} Zeichen.`),
});

async function assertSession(): Promise<void> {
  // Zusätzlich zur Middleware: Server Actions sind eigene Endpunkte und prüfen die Sitzung selbst.
  const cookieStore = await cookies();
  if (!(await isValidSession(cookieStore.get(SESSION_COOKIE)?.value))) throw new Error("Nicht angemeldet.");
}

export async function recordDrop(_prev: DropFormState, formData: FormData): Promise<DropFormState> {
  await assertSession();
  const parsed = dropSchema.safeParse({
    candidateSnapshotId: formData.get("candidateSnapshotId") ?? "",
    droppedAt: formData.get("droppedAt") ?? "",
    unitsSold: formData.get("unitsSold") ?? "",
    returnRatePercent: formData.get("returnRatePercent") ?? "",
    verdict: formData.get("verdict") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.", saved: false };

  const db = getDb();
  const snapshot = await db.candidateSnapshot.findUnique({
    where: { id: parsed.data.candidateSnapshotId },
    select: { id: true, productId: true, country: true, keyword: true },
  });
  if (!snapshot) return { error: "Kandidat nicht gefunden.", saved: false };

  await db.dropOutcome.create({
    data: {
      productId: snapshot.productId,
      candidateSnapshotId: snapshot.id,
      country: snapshot.country,
      keyword: snapshot.keyword,
      droppedAt: new Date(`${parsed.data.droppedAt}T00:00:00Z`),
      unitsSold: parsed.data.unitsSold,
      returnRate: parsed.data.returnRatePercent === null ? null : parsed.data.returnRatePercent / 100,
      verdict: parsed.data.verdict,
      note: parsed.data.note.trim() || null,
    },
  });
  revalidatePath(`/produkt/${snapshot.id}`);
  revalidatePath("/kalibrierung");
  return { error: null, saved: true };
}

export async function deleteDrop(formData: FormData): Promise<void> {
  await assertSession();
  const id = String(formData.get("id") ?? "");
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!id) return;
  await getDb().dropOutcome.delete({ where: { id } }).catch(() => undefined);
  if (snapshotId) revalidatePath(`/produkt/${snapshotId}`);
  revalidatePath("/kalibrierung");
}
