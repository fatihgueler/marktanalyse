"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { assertSession } from "@/lib/session";

/** Manuelle Produkte hängen über ein SupplyProduct mit dieser Quelle an DropOutcome (externalId = ProductCheck.id). */
const MANUAL_SOURCE = "manuell";

export interface DropFormState {
  error: string | null;
  saved: boolean;
}

const MAX_NOTE_LENGTH = 500;

const dropSchema = z.object({
  // genau eins von beiden: automatischer Kandidat oder Produkt-Check
  candidateSnapshotId: z.string(),
  productCheckId: z.string(),
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

export async function recordDrop(_prev: DropFormState, formData: FormData): Promise<DropFormState> {
  await assertSession();
  const parsed = dropSchema.safeParse({
    candidateSnapshotId: formData.get("candidateSnapshotId") ?? "",
    productCheckId: formData.get("productCheckId") ?? "",
    droppedAt: formData.get("droppedAt") ?? "",
    unitsSold: formData.get("unitsSold") ?? "",
    returnRatePercent: formData.get("returnRatePercent") ?? "",
    verdict: formData.get("verdict") ?? "",
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.", saved: false };

  const db = getDb();
  const outcome = {
    droppedAt: new Date(`${parsed.data.droppedAt}T00:00:00Z`),
    unitsSold: parsed.data.unitsSold,
    returnRate: parsed.data.returnRatePercent === null ? null : parsed.data.returnRatePercent / 100,
    verdict: parsed.data.verdict,
    note: parsed.data.note.trim() || null,
  };

  if (parsed.data.productCheckId) {
    const check = await db.productCheck.findUnique({ where: { id: parsed.data.productCheckId } });
    if (!check) return { error: "Produkt nicht gefunden.", saved: false };
    const product = await db.supplyProduct.upsert({
      where: { source_externalId: { source: MANUAL_SOURCE, externalId: check.id } },
      create: { source: MANUAL_SOURCE, externalId: check.id, title: check.name, url: check.url ?? "" },
      update: { title: check.name, url: check.url ?? "" },
    });
    await db.dropOutcome.create({ data: { productId: product.id, country: check.country, keyword: check.name, ...outcome } });
    await db.productCheck.update({ where: { id: check.id }, data: { stage: "ERGEBNIS" } });
    revalidatePath(`/merkliste/${check.id}`);
    revalidatePath("/merkliste");
    revalidatePath("/kalibrierung");
    return { error: null, saved: true };
  }

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
      ...outcome,
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
  const checkId = String(formData.get("checkId") ?? "");
  if (!id) return;
  await getDb().dropOutcome.delete({ where: { id } }).catch(() => undefined);
  if (snapshotId) revalidatePath(`/produkt/${snapshotId}`);
  if (checkId) revalidatePath(`/merkliste/${checkId}`);
  revalidatePath("/kalibrierung");
}
