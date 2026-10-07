import { MarginBreakdown } from "@/components/margin-breakdown";
import type { CheckView } from "@/app/check/actions";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CheckVerdict } from "@/scoring/product-check";

export const VERDICT_STYLE: Record<CheckVerdict, string> = {
  "Lohnt sich": "border-status-good/50 bg-status-good/10 text-status-good",
  Knapp: "border-status-warning/50 bg-status-warning/10 text-status-warning",
  "Finger weg": "border-destructive/50 bg-destructive/10 text-destructive",
};

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg border bg-background/40 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular">{value}</dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

/** Ergebnis des Produkt-Checks: Urteil, die vier Kernzahlen und der vollständige Rechenweg. */
export function CheckResult({ view }: { view: CheckView }) {
  const { result } = view;
  const m = result.margin;
  const c = m.currency;
  return (
    <section aria-label="Ergebnis des Produkt-Checks" className="grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("rounded-full border px-3 py-1 text-base font-semibold", VERDICT_STYLE[result.verdict])}>{result.verdict}</span>
        <p className="text-sm text-muted-foreground">{result.verdictReason}.</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Stückkosten bis zum Kunden" value={formatMoney(m.landedCost, c)} hint="inkl. Versand, Zoll und Einfuhrumsatzsteuer" />
        <Figure
          label={result.priceEstimated ? "Verkaufspreis (Schätzung)" : "Verkaufspreis"}
          value={formatMoney(m.referencePrice, c)}
          hint={result.priceEstimated ? "Einkauf × Kategorie-Faktor – besser selbst eintragen" : "brutto, wie eingegeben"}
        />
        <Figure label="Bleibt pro Stück" value={formatMoney(m.marginAbs, c)} hint={`${formatPercent(m.marginPct)} vom Nettoerlös, vor Werbung`} />
        <Figure label="Max. Werbebudget pro Verkauf" value={formatMoney(result.maxAdSpend, c)} hint="darüber macht jeder Verkauf Verlust" />
      </dl>
      <p className="text-xs text-muted-foreground">
        {view.sourcing === "grosshandel" ? "Gerechnet als Sammelbestellung über 1688 mit Lager in DE." : "Gerechnet als Einzelversand an den Kunden."}{" "}
        {view.fx.source === "ezb" && view.fx.date ? `Wechselkurse: EZB vom ${view.fx.date.split("-").reverse().join(".")}.` : "Wechselkurse: feste Werte aus der Config."}
      </p>
      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">Rechenweg anzeigen</summary>
        <div className="mt-3">
          <MarginBreakdown margin={m} referenceSourceLabel={result.priceEstimated ? "Schätzung über den Kategorie-Faktor" : "eigene Eingabe"} />
        </div>
      </details>
    </section>
  );
}
