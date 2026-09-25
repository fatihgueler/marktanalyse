import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { MarginBreakdown as MarginData } from "@/scoring/margin";
import { cn } from "@/lib/utils";

interface LineProps {
  label: string;
  amount: number;
  currency: string;
  hint?: string;
  sign?: "+" | "−" | "=";
  strong?: boolean;
  muted?: boolean;
}

function Line({ label, amount, currency, hint, sign, strong, muted }: LineProps) {
  return (
    <div className={cn("grid grid-cols-[1rem_1fr_auto] items-baseline gap-2 py-1.5", strong && "border-t border-border pt-2.5 font-semibold", muted && "text-subtle-foreground")}>
      <span className="font-mono text-xs text-subtle-foreground" aria-hidden="true">
        {sign ?? ""}
      </span>
      <span>
        {label}
        {hint ? <span className="block text-[11px] font-normal text-subtle-foreground">{hint}</span> : null}
      </span>
      <span className="font-mono tabular">{formatMoney(amount, currency)}</span>
    </div>
  );
}

/** Kaufmännische Rechnung: Landed Cost wie gefordert inkl. EUSt, danach Marge nach Steuerstatus. */
export function MarginBreakdown({ margin, referenceSourceLabel }: { margin: MarginData; referenceSourceLabel: string }) {
  const c = margin.currency;
  const vatModeLabel = margin.vatMode === "kleinunternehmer" ? "Kleinunternehmer" : "regelbesteuert";
  const w = margin.wholesale;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {w ? (
        <section aria-labelledby="landed-titel" className="rounded-xl border bg-card p-4 text-sm">
          <h3 id="landed-titel" className="mb-2 flex items-baseline justify-between gap-2 font-semibold">
            Stückkosten bis zum Kunden
            <span className="font-mono text-[11px] font-normal text-muted-foreground">Großhandel · Los {formatNumber(w.lotSize)} Stück</span>
          </h3>
          <Line
            label="Einkauf"
            amount={margin.purchase}
            currency={c}
            hint={`Staffel ab ${formatNumber(w.tierMinQty)} Stück: ${formatNumber(w.tierUnitPrice, 2)} ${w.tierCurrency}`}
          />
          <Line label="Agentengebühr" amount={w.agentFee} currency={c} sign="+" hint="Einkauf, Kontrolle, Konsolidierung" />
          <Line label="Luftfracht nach DE" amount={w.freight} currency={c} sign="+" hint={`${formatNumber(w.weightKg, 2)} kg ${w.weightSource === "config" ? "(Annahme)" : "(laut Quelle)"}`} />
          <Line label="Zoll" amount={margin.duty} currency={c} sign="+" hint={margin.dutyRule} />
          <Line label="Einfuhrumsatzsteuer" amount={margin.importVat} currency={c} sign="+" hint={margin.importVatRule} />
          <Line label="Verzollung (anteilig)" amount={margin.clearanceFee} currency={c} sign="+" />
          <Line label="Versand an Kunde" amount={w.lastMile} currency={c} sign="+" hint={`ab Lager in ${w.importCountry}`} />
          <Line label="Stückkosten" amount={margin.landedCost} currency={c} sign="=" strong />
        </section>
      ) : (
      <section aria-labelledby="landed-titel" className="rounded-xl border bg-card p-4 text-sm">
        <h3 id="landed-titel" className="mb-2 font-semibold">Landed Cost je Stück</h3>
        <Line label="Einkauf" amount={margin.purchase} currency={c} hint="Lieferantenpreis, umgerechnet" />
        <Line label="Versand" amount={margin.shipping} currency={c} sign="+" hint={margin.shippingSource === "config" ? "Annahme aus Config" : "laut Quelle"} />
        <Line label="Zoll" amount={margin.duty} currency={c} sign="+" hint={margin.dutyRule} />
        <Line label="Einfuhrumsatzsteuer" amount={margin.importVat} currency={c} sign="+" hint={margin.importVatRule} />
        {margin.clearanceFee > 0 ? <Line label="Abfertigung" amount={margin.clearanceFee} currency={c} sign="+" /> : null}
        <Line label="Landed Cost" amount={margin.landedCost} currency={c} sign="=" strong />
      </section>
      )}

      <section aria-labelledby="marge-titel" className="rounded-xl border bg-card p-4 text-sm">
        <h3 id="marge-titel" className="mb-2 flex items-baseline justify-between gap-2 font-semibold">
          Marge
          <span className="font-mono text-[11px] font-normal text-muted-foreground">Steuerstatus: {vatModeLabel}</span>
        </h3>
        <Line label="Referenz-Verkaufspreis (brutto)" amount={margin.referencePrice} currency={c} hint={referenceSourceLabel} />
        {margin.sellerChargesVat ? <Line label="Umsatzsteuer aus Verkauf" amount={margin.saleVat} currency={c} sign="−" /> : null}
        <Line label="Nettoerlös" amount={margin.netRevenue} currency={c} sign="=" muted={!margin.sellerChargesVat} />
        <Line
          label="Kosten"
          amount={margin.effectiveCost}
          currency={c}
          sign="−"
          hint={margin.importVatDeductible ? "Landed Cost ohne EUSt (als Vorsteuer abziehbar)" : "Landed Cost (EUSt nicht abziehbar)"}
        />
        <Line label="Zahlungsgebühren" amount={margin.paymentFees} currency={c} sign="−" />
        <Line label={`Marge (${formatPercent(margin.marginPct, 1)})`} amount={margin.marginAbs} currency={c} sign="=" strong />
      </section>
    </div>
  );
}
