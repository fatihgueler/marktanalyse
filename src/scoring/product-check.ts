import { radarConfig, type CategoryId, type Country, type RadarConfig } from "@/config/radar.config";
import { calculateMargin, calculateWholesaleMargin, convertCurrency, fallbackReferencePrice, type MarginBreakdown } from "./margin";
import type { TrendBreakdown } from "./trend";

export type CheckVerdict = "Lohnt sich" | "Knapp" | "Finger weg";
export type Sourcing = "einzeln" | "grosshandel";
export type TrendPhase = "Frühphase" | "Wachstum" | "Saison" | "Kein Anstieg" | "Rauschen";

export interface ProductCheckInput {
  country: Country;
  category: CategoryId;
  /** Stückpreis beim Anbieter */
  purchasePrice: number;
  purchaseCurrency: string;
  /** Versand je Stück in der Einkaufswährung; null → Config-Annahme (nur Einzelversand) */
  shippingCost: number | null;
  /** nur Großhandel: Versandgewicht je Stück; null → Config-Annahme der Kategorie */
  weightKg: number | null;
  /** geplanter Verkaufspreis brutto in Landeswährung; null → Schätzung über den Kategorie-Faktor */
  plannedPrice: number | null;
  sourcing: Sourcing;
}

export interface ProductCheckResult {
  margin: MarginBreakdown;
  /** true, wenn der Verkaufspreis geschätzt wurde */
  priceEstimated: boolean;
  /** höchstes Werbebudget pro Verkauf, bei dem noch kein Verlust entsteht (Landeswährung) */
  maxAdSpend: number;
  verdict: CheckVerdict;
  verdictReason: string;
}

/** 1688-Links werden als Sammelbestellung (Großhandel) gerechnet, alles andere als Einzelversand. */
export function sourcingFromUrl(url: string | null): Sourcing {
  if (!url) return "einzeln";
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "1688.com" || host.endsWith(".1688.com") ? "grosshandel" : "einzeln";
  } catch {
    return "einzeln";
  }
}

/** Urteil aus Marge in % und € (Schwellen: `productCheck` in der Config, in EUR → Landeswährung umgerechnet). */
export function checkVerdict(margin: MarginBreakdown, config: RadarConfig = radarConfig): { verdict: CheckVerdict; reason: string } {
  const { worthIt, tight } = config.productCheck;
  const toLocal = (eur: number) => convertCurrency(eur, "EUR", margin.currency, config.fx);
  const meets = (t: { minMarginPct: number; minMarginAbsEur: number }) => margin.marginPct >= t.minMarginPct && margin.marginAbs >= toLocal(t.minMarginAbsEur);
  const pct = (share: number) => `${Math.round(share * 100)} %`;
  const money = (eur: number) => `${Math.round(toLocal(eur))} ${margin.currency}`;
  if (meets(worthIt)) {
    return { verdict: "Lohnt sich", reason: `Marge mindestens ${pct(worthIt.minMarginPct)} und ${money(worthIt.minMarginAbsEur)} pro Stück` };
  }
  if (meets(tight)) {
    return { verdict: "Knapp", reason: `Marge erreicht ${pct(tight.minMarginPct)} und ${money(tight.minMarginAbsEur)}, aber nicht ${pct(worthIt.minMarginPct)} und ${money(worthIt.minMarginAbsEur)}` };
  }
  return { verdict: "Finger weg", reason: `Marge unter ${pct(tight.minMarginPct)} oder unter ${money(tight.minMarginAbsEur)} pro Stück` };
}

/**
 * Produkt-Check: dieselbe Kalkulation wie im automatischen Lauf (Zoll, EUSt, Kleinunternehmer-
 * regelung, UK-USt, Gebühren), aus manuell eingegebenen Werten.
 */
export function checkProduct(input: ProductCheckInput, config: RadarConfig = radarConfig): ProductCheckResult {
  const currency = config.countries[input.country].currency;
  const priceEstimated = input.plannedPrice === null;
  const referencePrice =
    input.plannedPrice ?? fallbackReferencePrice(input.purchasePrice, input.purchaseCurrency, input.country, input.category, config);

  const margin =
    input.sourcing === "grosshandel"
      ? calculateWholesaleMargin(
          {
            country: input.country,
            category: input.category,
            basePrice: input.purchasePrice,
            priceTiers: [],
            purchaseCurrency: input.purchaseCurrency,
            moq: null,
            weightKg: input.weightKg,
            referencePrice,
            referenceCurrency: currency,
          },
          config,
        )
      : calculateMargin(
          {
            country: input.country,
            category: input.category,
            purchasePrice: input.purchasePrice,
            purchaseCurrency: input.purchaseCurrency,
            shippingCost: input.shippingCost,
            shippingCurrency: input.purchaseCurrency,
            referencePrice,
            referenceCurrency: currency,
          },
          config,
        );

  const { verdict, reason } = checkVerdict(margin, config);
  return { margin, priceEstimated, maxAdSpend: Math.max(0, margin.marginAbs), verdict, verdictReason: reason };
}

/**
 * Phase einer Trendkurve aus der bestehenden Trend-Bewertung.
 * „Kein Anstieg“ ergänzt die drei Phasen, weil eine fallende Kurve weder Frühphase noch Rauschen ist.
 */
export function trendPhase(trend: TrendBreakdown, config: RadarConfig = radarConfig): TrendPhase {
  if (trend.rejectedReason) return "Rauschen";
  if (trend.growth <= 0) return "Kein Anstieg";
  if (trend.seasonal) return "Saison";
  return trend.earlyComponent >= config.productCheck.earlyPhaseMin ? "Frühphase" : "Wachstum";
}
