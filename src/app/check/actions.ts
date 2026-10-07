"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CATEGORY_IDS, COUNTRIES, radarConfig } from "@/config/radar.config";
import { getDb } from "@/lib/db";
import { STAGES } from "@/lib/pipeline";
import { parseGoogleTrendsCsv } from "@/lib/google-trends-csv";
import { assertSession } from "@/lib/session";
import { checkProduct, sourcingFromUrl, trendPhase, type ProductCheckResult, type Sourcing } from "@/scoring/product-check";
import { scoreTrend } from "@/scoring/trend";
import { loadFxRates, withFx, type FxInfo } from "@/sources/fx/ecb";
import type { Prisma } from "@/generated/prisma/client";

const PURCHASE_CURRENCIES = ["EUR", "USD", "CNY"] as const;
/** EZB-Kurse ändern sich einmal am Tag – sechs Stunden zwischenspeichern spart Wartezeit bei jeder Prüfung */
const FX_CACHE_MS = 6 * 3_600_000;
/** Google-Trends-Exporte sind wenige KB groß */
const MAX_CSV_BYTES = 1_000_000;

let fxCache: { at: number; fx: FxInfo } | null = null;
async function currentFx(): Promise<FxInfo> {
  if (fxCache && Date.now() - fxCache.at < FX_CACHE_MS) return fxCache.fx;
  const { fx } = await loadFxRates();
  // Feste Kurse (EZB nicht erreichbar) nicht cachen – beim nächsten Mal erneut versuchen
  if (fx.source === "ezb") fxCache = { at: Date.now(), fx };
  return fx;
}

const decimal = (label: string, { optional }: { optional: boolean }) =>
  z
    .string()
    .transform((v) => v.trim().replace(",", "."))
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => (v === null ? optional : Number.isFinite(v) && v >= 0), optional ? `${label}: Zahl ≥ 0 oder leer lassen.` : `${label} fehlt.`);

const checkSchema = z.object({
  name: z.string().trim().min(2, "Name: mindestens 2 Zeichen.").max(120, "Name: höchstens 120 Zeichen."),
  url: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Link: bitte eine vollständige Adresse mit https:// angeben.")
    .transform((v) => v || null),
  purchasePrice: decimal("Einkaufspreis", { optional: false }).refine((v) => v !== null && v > 0, "Einkaufspreis muss größer als 0 sein."),
  purchaseCurrency: z.enum(PURCHASE_CURRENCIES, { message: "Währung: EUR, USD oder CNY." }),
  shippingCost: decimal("Versand", { optional: true }),
  weightKg: decimal("Gewicht", { optional: true }).refine((v) => v === null || v > 0, "Gewicht muss größer als 0 sein."),
  category: z.enum(CATEGORY_IDS, { message: "Bitte eine Kategorie wählen." }),
  country: z.enum(COUNTRIES as unknown as [string, ...string[]], { message: "Bitte ein Zielland wählen." }),
  plannedPrice: decimal("Verkaufspreis", { optional: true }).refine((v) => v === null || v > 0, "Verkaufspreis muss größer als 0 sein."),
  stage: z.enum(STAGES).catch("GEPRUEFT"),
});

export interface CheckView {
  name: string;
  country: (typeof COUNTRIES)[number];
  sourcing: Sourcing;
  result: ProductCheckResult;
  fx: { source: FxInfo["source"]; date: string | null };
}

export interface CheckFormState {
  error: string | null;
  values: Record<string, string>;
  view: CheckView | null;
}

const FIELDS = ["id", "name", "url", "purchasePrice", "purchaseCurrency", "shippingCost", "weightKg", "category", "country", "plannedPrice", "stage"] as const;

/** „Prüfen“ rechnet nur; „Auf die Merkliste“ speichert (neu oder Änderung) und öffnet den Eintrag. */
export async function checkProductAction(_prev: CheckFormState, formData: FormData): Promise<CheckFormState> {
  await assertSession();
  const values = Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? "")]));
  const parsed = checkSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Eingabe ungültig.", values, view: null };
  const input = parsed.data;
  const country = input.country as CheckView["country"];
  const sourcing = sourcingFromUrl(input.url);

  const fx = await currentFx();
  let result: ProductCheckResult;
  try {
    result = checkProduct(
      {
        country,
        category: input.category,
        purchasePrice: input.purchasePrice!,
        purchaseCurrency: input.purchaseCurrency,
        shippingCost: input.shippingCost,
        weightKg: input.weightKg,
        plannedPrice: input.plannedPrice,
        sourcing,
      },
      withFx(radarConfig, fx),
    );
  } catch (error) {
    const message = error instanceof Error && /Großhandel/.test(error.message)
      ? `1688-Links werden als Sammelbestellung mit Lager in DE gerechnet – das geht nur für ${radarConfig.wholesale.countries.join(" und ")}.`
      : "Die Rechnung ist fehlgeschlagen. Bitte die Eingaben prüfen.";
    return { error: message, values, view: null };
  }
  const view: CheckView = { name: input.name, country, sourcing, result, fx: { source: fx.source, date: fx.date } };

  if (formData.get("intent") !== "save") return { error: null, values, view };

  const data = {
    name: input.name,
    url: input.url,
    purchasePrice: input.purchasePrice!,
    purchaseCurrency: input.purchaseCurrency,
    shippingCost: input.shippingCost,
    weightKg: input.weightKg,
    category: input.category,
    country,
    plannedPrice: input.plannedPrice,
    stage: input.stage,
    result: { ...view } as unknown as Prisma.InputJsonValue,
    verdict: result.verdict,
    marginScore: result.margin.score,
    marginAbs: result.margin.marginAbs,
    marginPct: result.margin.marginPct,
  };
  const db = getDb();
  const id = values.id ? (await db.productCheck.update({ where: { id: values.id }, data })).id : (await db.productCheck.create({ data })).id;
  revalidatePath("/merkliste");
  revalidatePath("/");
  redirect(`/merkliste/${id}`);
}

export async function moveStage(formData: FormData): Promise<void> {
  await assertSession();
  const id = String(formData.get("id") ?? "");
  const stage = z.enum(STAGES).safeParse(formData.get("stage"));
  if (!id || !stage.success) return;
  await getDb().productCheck.update({ where: { id }, data: { stage: stage.data } });
  revalidatePath("/merkliste");
  revalidatePath(`/merkliste/${id}`);
}

/** Löscht den Eintrag samt Drop-Ergebnissen (über das zugehörige SupplyProduct „manuell“). */
export async function deleteCheck(formData: FormData): Promise<void> {
  await assertSession();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = getDb();
  await db.supplyProduct.deleteMany({ where: { source: "manuell", externalId: id } });
  await db.productCheck.delete({ where: { id } }).catch(() => undefined);
  revalidatePath("/merkliste");
  revalidatePath("/kalibrierung");
  revalidatePath("/");
  redirect("/merkliste");
}

export interface TrendImportState {
  error: string | null;
  message: string | null;
}

/** Google-Trends-CSV hochladen und mit der bestehenden Trend-Logik bewerten. */
export async function importTrendCsv(_prev: TrendImportState, formData: FormData): Promise<TrendImportState> {
  await assertSession();
  const id = String(formData.get("id") ?? "");
  const file = formData.get("csv");
  if (!id) return { error: "Eintrag fehlt.", message: null };
  if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine CSV-Datei auswählen.", message: null };
  if (file.size > MAX_CSV_BYTES) return { error: "Die Datei ist zu groß für einen Google-Trends-Export.", message: null };

  try {
    const parsed = parseGoogleTrendsCsv(await file.text());
    const values = parsed.series.map((p) => p.value);
    if (values.length < radarConfig.trend.minSeriesWeeks) {
      return {
        error: `Nur ${values.length} Wochen in der Datei, mindestens ${radarConfig.trend.minSeriesWeeks} nötig. Bitte „Letzte 12 Monate“ exportieren.`,
        message: null,
      };
    }
    const trend = scoreTrend(values);
    const phase = trendPhase(trend);
    await getDb().productCheck.update({
      where: { id },
      data: {
        trendKeyword: parsed.keyword,
        trendSeries: parsed.series as unknown as Prisma.InputJsonValue,
        trendScore: trend.score,
        trendPhase: phase,
      },
    });
    revalidatePath(`/merkliste/${id}`);
    revalidatePath("/merkliste");
    revalidatePath("/");
    return { error: null, message: `„${parsed.keyword}“: ${values.length} Wochen (${parsed.granularity}) eingelesen – Phase: ${phase}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Die CSV konnte nicht gelesen werden.", message: null };
  }
}
