"use client";

import { startTransition, useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { checkProductAction, type CheckFormState } from "@/app/check/actions";
import { CheckResult } from "@/components/check-result";
import { ResearchLinks } from "@/components/research-links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_IDS, COUNTRIES, radarConfig, type Country } from "@/config/radar.config";
import { STAGES, STAGE_LABELS } from "@/lib/pipeline";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>option]:bg-popover";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Produkt-Check: „Prüfen“ zeigt das Ergebnis sofort, „Auf die Merkliste“ speichert es.
 * Mit `defaults.id` wird ein bestehender Merkliste-Eintrag geändert.
 */
export function ProductCheckForm({ defaults }: { defaults: Record<string, string> }) {
  const [state, formAction, pending] = useActionState<CheckFormState, FormData>(checkProductAction, { error: null, values: defaults, view: null });
  const values = state.values;
  const [country, setCountry] = useState<Country>((values.country as Country) || "DE");
  const [category, setCategory] = useState(values.category || "");
  const [purchaseCurrency, setPurchaseCurrency] = useState(values.purchaseCurrency || "EUR");
  const [stage, setStage] = useState(values.stage || "GEPRUEFT");
  const currency = radarConfig.countries[country].currency;

  return (
    <div className="grid gap-6">
      {/* Absenden per onSubmit statt action={…}: So setzt React das Formular nach „Prüfen“ nicht zurück
          und alle Eingaben bleiben stehen, um Varianten durchzurechnen. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          const data = new FormData(event.currentTarget, submitter);
          startTransition(() => formAction(data));
        }}
        className="grid gap-5 rounded-xl border bg-card p-4 sm:p-5"
      >
        <input type="hidden" name="id" value={values.id ?? ""} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Produktname">
            <Input id="name" name="name" required defaultValue={values.name} placeholder="z. B. Wolkenlampe" />
          </Field>
          <Field id="url" label="Link (optional)" hint="AliExpress, Temu oder 1688. 1688 wird als Sammelbestellung gerechnet.">
            <Input id="url" name="url" type="url" inputMode="url" defaultValue={values.url} placeholder="https://…" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="purchasePrice" label="Einkaufspreis pro Stück">
            <div className="flex gap-2">
              <Input id="purchasePrice" name="purchasePrice" required inputMode="decimal" defaultValue={values.purchasePrice} placeholder="6,50" />
              <select
                name="purchaseCurrency"
                aria-label="Währung des Einkaufspreises"
                value={purchaseCurrency}
                onChange={(e) => setPurchaseCurrency(e.target.value)}
                className={`${SELECT_CLASS} w-24`}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
              </select>
            </div>
          </Field>
          <Field id="shippingCost" label="Versand pro Stück (optional)" hint="Gleiche Währung wie der Einkauf. Leer = Pauschale aus der Config.">
            <Input id="shippingCost" name="shippingCost" inputMode="decimal" defaultValue={values.shippingCost} placeholder="leer = Pauschale" />
          </Field>
          <Field id="weightKg" label="Gewicht in kg (optional)" hint="Zählt nur bei 1688 (Luftfracht nach Gewicht).">
            <Input id="weightKg" name="weightKg" inputMode="decimal" defaultValue={values.weightKg} placeholder="0,4" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="category" label="Kategorie">
            <select id="category" name="category" required value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT_CLASS}>
              <option value="" disabled>
                Bitte wählen
              </option>
              {CATEGORY_IDS.map((id) => (
                <option key={id} value={id}>
                  {radarConfig.categories[id].label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="country" label="Zielland">
            <select id="country" name="country" value={country} onChange={(e) => setCountry(e.target.value as Country)} className={SELECT_CLASS}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {radarConfig.countries[c].label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="plannedPrice" label={`Geplanter Verkaufspreis (${currency}, brutto)`} hint="Leer = Schätzung über den Kategorie-Faktor.">
            <Input id="plannedPrice" name="plannedPrice" inputMode="decimal" defaultValue={values.plannedPrice} placeholder="leer = Schätzung" />
          </Field>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Button type="submit" name="intent" value="check" disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            Prüfen
          </Button>
          <div className="flex items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="stage" className="text-xs text-muted-foreground">
                Stufe
              </Label>
              <select id="stage" name="stage" value={stage} onChange={(e) => setStage(e.target.value)} className={`${SELECT_CLASS} w-32`}>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" name="intent" value="save" variant="outline" disabled={pending}>
              {values.id ? "Änderungen speichern" : "Auf die Merkliste"}
            </Button>
          </div>
          <p role="status" aria-live="polite" className="text-sm text-destructive">
            {state.error}
          </p>
        </div>
      </form>

      {state.view ? (
        <>
          <CheckResult view={state.view} />
          <section aria-labelledby="recherche-titel" className="grid gap-3">
            <h2 id="recherche-titel" className="text-lg font-semibold">
              Recherche zu „{state.view.name}“
            </h2>
            <ResearchLinks name={state.view.name} country={state.view.country} />
          </section>
        </>
      ) : null}
    </div>
  );
}
