import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { ProductCheckForm } from "@/components/product-check-form";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Produkt-Check · Trend-Radar" };

/** Werte eines Merkliste-Eintrags als Formular-Vorbelegung (zum Ändern). */
async function defaultsFor(id: string | undefined): Promise<Record<string, string>> {
  if (!id) return {};
  const check = await getDb().productCheck.findUnique({ where: { id } });
  if (!check) return {};
  const num = (v: { toString(): string } | number | null) => (v === null ? "" : String(v).replace(".", ","));
  return {
    id: check.id,
    name: check.name,
    url: check.url ?? "",
    purchasePrice: num(check.purchasePrice),
    purchaseCurrency: check.purchaseCurrency,
    shippingCost: num(check.shippingCost),
    weightKg: num(check.weightKg),
    category: check.category,
    country: check.country,
    plannedPrice: num(check.plannedPrice),
    stage: check.stage,
  };
}

export default async function CheckPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const defaults = await defaultsFor(typeof params.id === "string" ? params.id : undefined);
  return (
    <>
      <AppHeader active="check" />
      <main id="inhalt" className="mx-auto grid max-w-[1100px] gap-6 px-4 pb-16 pt-8 sm:px-6">
        <section aria-labelledby="titel" className="grid gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Produkt-Check</p>
          <h1 id="titel" className="text-3xl font-bold tracking-tight">{defaults.id ? `„${defaults.name}“ ändern` : "Rechnet sich das Produkt?"}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Einkaufspreis und Zielland eintragen, der Radar rechnet mit Versand, Zoll, Einfuhrumsatzsteuer, Kleinunternehmerregelung und Gebühren.
            Gespeicherte Produkte landen auf der{" "}
            <Link href="/merkliste" className="text-primary underline-offset-4 hover:underline">
              Merkliste
            </Link>
            .
          </p>
        </section>
        <ProductCheckForm defaults={defaults} />
      </main>
    </>
  );
}
