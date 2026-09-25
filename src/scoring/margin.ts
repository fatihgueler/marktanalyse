import { radarConfig, type CategoryId, type Country, type RadarConfig } from "@/config/radar.config";
import { clamp } from "@/lib/stats";
import type { PriceTier } from "@/sources/types";

export interface MarginInput {
  country: Country;
  category: CategoryId;
  /** Stückpreis beim Lieferanten */
  purchasePrice: number;
  purchaseCurrency: string;
  /** Versand je Stück; null → Config-Annahme */
  shippingCost: number | null;
  shippingCurrency: string;
  /** westlicher Endkundenpreis, brutto */
  referencePrice: number;
  referenceCurrency: string;
}

export interface MarginBreakdown {
  currency: string;
  vatMode: RadarConfig["tax"]["vatMode"];
  purchase: number;
  shipping: number;
  shippingSource: "quelle" | "config";
  customsValue: number;
  duty: number;
  dutyRule: string;
  importVat: number;
  importVatRule: string;
  clearanceFee: number;
  /** Einkauf + Versand + Zoll + EUSt + Abfertigung – wie gefordert inkl. Einfuhrumsatzsteuer */
  landedCost: number;
  referencePrice: number;
  sellerChargesVat: boolean;
  /** abzuführende USt aus dem Verkauf (0 bei Kleinunternehmer) */
  saleVat: number;
  netRevenue: number;
  importVatDeductible: boolean;
  /** Kosten nach Vorsteuerabzug */
  effectiveCost: number;
  paymentFees: number;
  marginAbs: number;
  marginPct: number;
  minMarginAbs: number;
  belowMinMargin: boolean;
  /** nur bei Großhandel (1688): Details der Sammelbestellung */
  wholesale?: WholesaleDetails;
  /** Skala des Margen-Scores zum Zeitpunkt der Berechnung */
  minMarginPct: number;
  targetMarginPct: number;
  /** 0..1 */
  score: number;
}

const PERCENT_FORMAT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/** 0.19 → „19 %“, 0.047 → „4,7 %“ – für die Regeltexte im Rechenweg */
function percentLabel(share: number): string {
  return `${PERCENT_FORMAT.format(share * 100)} %`;
}

/** Rechnet zwischen Währungen über die Config-Kurse (Einheiten je 1 EUR). */
export function convertCurrency(amount: number, from: string, to: string, fx: Record<string, number> = radarConfig.fx): number {
  if (from === to) return amount;
  const fromRate = fx[from];
  const toRate = fx[to];
  if (!fromRate || !toRate) throw new Error(`Kein Wechselkurs für ${from} → ${to} in der Config.`);
  return (amount / fromRate) * toRate;
}

/**
 * Fallback, wenn keine Shopping-Preise vorliegen: typischer Endkundenpreis als
 * Einkaufspreis × Kategorie-Multiplikator, in Landeswährung.
 */
export function fallbackReferencePrice(
  purchasePrice: number,
  purchaseCurrency: string,
  country: Country,
  category: CategoryId,
  config: RadarConfig = radarConfig,
): number {
  const currency = config.countries[country].currency;
  return convertCurrency(purchasePrice, purchaseCurrency, currency, config.fx) * config.categories[category].retailMultiplier;
}

/**
 * Landed Cost und Marge je Stück in der Landeswährung des Ziellandes.
 *
 * Steuerlogik:
 * - Kleinunternehmer: keine USt auf den Verkauf, die Einfuhrumsatzsteuer ist echter Kostenfaktor.
 * - Regelbesteuert (oder Land mit Pflicht-USt wie UK): USt wird aus dem Bruttopreis herausgerechnet,
 *   die Einfuhrumsatzsteuer ist als Vorsteuer abziehbar.
 */
export function calculateMargin(input: MarginInput, config: RadarConfig = radarConfig): MarginBreakdown {
  const { country, category } = input;
  const currency = config.countries[country].currency;
  const tax = config.tax.countries[country];
  const customs = config.customs[country];
  const fx = config.fx;

  const purchase = convertCurrency(input.purchasePrice, input.purchaseCurrency, currency, fx);
  const shippingSource = input.shippingCost === null ? "config" : "quelle";
  const shipping =
    input.shippingCost === null
      ? convertCurrency(config.shipping.perItemEur[country], "EUR", currency, fx)
      : convertCurrency(input.shippingCost, input.shippingCurrency, currency, fx);
  const referencePrice = convertCurrency(input.referencePrice, input.referenceCurrency, currency, fx);

  // Zoll: Zollwert = Warenwert + Versand (CIF-Näherung)
  const customsValue = purchase + shipping;
  let duty: number;
  let dutyRule: string;
  if (customsValue < customs.lowValueThreshold) {
    const rule = customs.lowValueRule;
    duty = rule.type === "flatPerItem" ? rule.amount : 0;
    dutyRule =
      rule.type === "flatPerItem"
        ? `Kleinsendung < ${customs.lowValueThreshold} ${currency}: Pauschale ${rule.amount} ${currency}`
        : `Kleinsendung < ${customs.lowValueThreshold} ${currency}: zollfrei`;
  } else {
    const rate = config.categories[category].dutyRate[customs.tariffZone];
    duty = customsValue * rate;
    dutyRule = `${percentLabel(rate)} Zoll (${customs.tariffZone}, ${config.categories[category].label})`;
  }

  // Einfuhrumsatzsteuer
  let importVat: number;
  let importVatRule: string;
  if (tax.importVatCollectedAtSaleBelow !== null && customsValue <= tax.importVatCollectedAtSaleBelow) {
    importVat = 0;
    importVatRule = `Warenwert ≤ ${tax.importVatCollectedAtSaleBelow} ${currency}: USt wird beim Verkauf erhoben`;
  } else {
    importVat = (customsValue + duty) * tax.vatRate;
    importVatRule = `${percentLabel(tax.vatRate)} auf Zollwert + Zoll`;
    if (importVat < tax.importVatMinimum) {
      importVat = 0;
      importVatRule = `Betrag unter ${tax.importVatMinimum} ${currency}: nicht erhoben`;
    }
  }

  const clearanceFee = duty > 0 || importVat > 0 ? customs.clearanceFeePerItem : 0;
  const landedCost = customsValue + duty + importVat + clearanceFee;

  const sellerChargesVat =
    tax.saleVat === "always" || (tax.saleVat === "followVatMode" && config.tax.vatMode === "regelbesteuert");
  const netRevenue = sellerChargesVat ? referencePrice / (1 + tax.vatRate) : referencePrice;
  const saleVat = referencePrice - netRevenue;
  const importVatDeductible = sellerChargesVat && importVat > 0;
  const effectiveCost = landedCost - (importVatDeductible ? importVat : 0);

  // Zahlungsgebühren werden auf den Betrag erhoben, den der Kunde zahlt (brutto).
  const paymentFees = referencePrice * config.fees.paymentFeePct + convertCurrency(config.fees.paymentFeeFixedEur, "EUR", currency, fx);

  const marginAbs = netRevenue - effectiveCost - paymentFees;
  const marginPct = netRevenue > 0 ? marginAbs / netRevenue : 0;
  const minMarginAbs = convertCurrency(config.margin.minMarginAbsEur, "EUR", currency, fx);
  const { minMarginPct, targetMarginPct } = config.margin;
  const score = clamp((marginPct - minMarginPct) / (targetMarginPct - minMarginPct), 0, 1);

  return {
    currency,
    vatMode: config.tax.vatMode,
    purchase,
    shipping,
    shippingSource,
    customsValue,
    duty,
    dutyRule,
    importVat,
    importVatRule,
    clearanceFee,
    landedCost,
    referencePrice,
    sellerChargesVat,
    saleVat,
    netRevenue,
    importVatDeductible,
    effectiveCost,
    paymentFees,
    marginAbs,
    marginPct,
    minMarginAbs,
    belowMinMargin: marginAbs < minMarginAbs,
    minMarginPct,
    targetMarginPct,
    score,
  };
}

// ── Großhandel (1688) ───────────────────────────────────────────────────

export interface WholesaleDetails {
  lotSize: number;
  /** Stückpreis der gewählten Staffel in Originalwährung */
  tierUnitPrice: number;
  tierMinQty: number;
  tierCurrency: string;
  agentFee: number;
  freight: number;
  weightKg: number;
  weightSource: "quelle" | "config";
  lastMile: number;
  importCountry: Country;
}

export interface WholesaleMarginInput {
  country: Country;
  category: CategoryId;
  /** Basispreis (1 Stück) und Staffeln, Originalwährung */
  basePrice: number;
  priceTiers: PriceTier[];
  purchaseCurrency: string;
  moq: number | null;
  weightKg: number | null;
  referencePrice: number;
  referenceCurrency: string;
}

/** Stückpreis bei gegebener Menge: höchste Staffel, deren Mindestmenge erreicht ist. */
export function tierPrice(basePrice: number, tiers: readonly PriceTier[], quantity: number): PriceTier {
  const reached = [...tiers].filter((t) => t.minQty <= quantity && t.price > 0).sort((a, b) => b.minQty - a.minQty);
  return reached[0] ?? { minQty: 1, price: basePrice };
}

/**
 * Stückkosten und Marge bei Großhandelsbeschaffung: Sammelbestellung über einen Einkaufsagenten,
 * Luftfracht nach DE, reguläre Verzollung (Sendung > 150 €, keine Kleinsendungsregel), Lager in DE,
 * Versand an Endkunden. Steuerlogik wie beim Direktversand, die EUSt fällt aber im Einfuhrland DE an.
 */
export function calculateWholesaleMargin(input: WholesaleMarginInput, config: RadarConfig = radarConfig): MarginBreakdown {
  const { country, category } = input;
  const w = config.wholesale;
  if (!w.countries.includes(country)) throw new Error(`Großhandel ist für ${country} nicht konfiguriert (wholesale.countries).`);
  const importCountry: Country = "DE";
  const currency = config.countries[country].currency;
  const fx = config.fx;
  const eur = (amount: number) => convertCurrency(amount, "EUR", currency, fx);

  const lotSize = Math.max(w.lotSize, input.moq ?? 0);
  const tier = tierPrice(input.basePrice, input.priceTiers, lotSize);
  const purchase = convertCurrency(tier.price, input.purchaseCurrency, currency, fx);
  const weightKg = input.weightKg ?? w.defaultWeightKg[category];
  const freight = eur(weightKg * w.freightPerKgEur);
  const agentFee = purchase * w.agentFeePct;

  // ANNAHME: Einkaufsprovisionen gehören nicht zum Zollwert (Art. 71 UZK) → Zollwert = Ware + Fracht
  const customsValue = purchase + freight;
  const dutyRate = config.categories[category].dutyRate.EU;
  const duty = customsValue * dutyRate;
  const importVatRate = config.tax.countries[importCountry].vatRate;
  const importVat = (customsValue + duty) * importVatRate;
  const clearanceFee = eur(w.clearanceFeePerShipmentEur) / lotSize;
  const lastMile = eur(w.lastMileEur[country] ?? 0);
  // Stückkosten bis zum Kunden – vergleichbar mit dem Direktversand, der den Versand ebenfalls enthält
  const landedCost = purchase + agentFee + freight + duty + importVat + clearanceFee + lastMile;

  const tax = config.tax.countries[country];
  const referencePrice = convertCurrency(input.referencePrice, input.referenceCurrency, currency, fx);
  const sellerChargesVat = tax.saleVat === "always" || (tax.saleVat === "followVatMode" && config.tax.vatMode === "regelbesteuert");
  const netRevenue = sellerChargesVat ? referencePrice / (1 + tax.vatRate) : referencePrice;
  const saleVat = referencePrice - netRevenue;
  const importVatDeductible = sellerChargesVat;
  const effectiveCost = landedCost - (importVatDeductible ? importVat : 0);
  const paymentFees = referencePrice * config.fees.paymentFeePct + eur(config.fees.paymentFeeFixedEur);
  const marginAbs = netRevenue - effectiveCost - paymentFees;
  const marginPct = netRevenue > 0 ? marginAbs / netRevenue : 0;
  const minMarginAbs = eur(config.margin.minMarginAbsEur);
  const { minMarginPct, targetMarginPct } = config.margin;

  return {
    currency,
    vatMode: config.tax.vatMode,
    purchase,
    shipping: freight,
    shippingSource: input.weightKg === null ? "config" : "quelle",
    customsValue,
    duty,
    dutyRule: `${percentLabel(dutyRate)} Zoll (EU, Sammelimport)`,
    importVat,
    importVatRule: `${percentLabel(importVatRate)} EUSt bei Einfuhr nach ${importCountry}`,
    clearanceFee,
    landedCost,
    referencePrice,
    sellerChargesVat,
    saleVat,
    netRevenue,
    importVatDeductible,
    effectiveCost,
    paymentFees,
    marginAbs,
    marginPct,
    minMarginAbs,
    belowMinMargin: marginAbs < minMarginAbs,
    wholesale: {
      lotSize,
      tierUnitPrice: tier.price,
      tierMinQty: tier.minQty,
      tierCurrency: input.purchaseCurrency,
      agentFee,
      freight,
      weightKg,
      weightSource: input.weightKg === null ? "config" : "quelle",
      lastMile,
      importCountry,
    },
    minMarginPct,
    targetMarginPct,
    score: clamp((marginPct - minMarginPct) / (targetMarginPct - minMarginPct), 0, 1),
  };
}
