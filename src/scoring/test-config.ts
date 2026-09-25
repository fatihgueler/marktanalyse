import { radarConfig, type RadarConfig } from "@/config/radar.config";

/**
 * Feste Test-Config: Die Tests prüfen die Rechenlogik gegen handgerechnete Werte.
 * Sie überschreibt alle Werte, die in die Rechnungen eingehen – so bleiben die Tests grün,
 * wenn in `radar.config.ts` Annahmen angepasst werden.
 */
export function makeTestConfig(): RadarConfig {
  const config = structuredClone(radarConfig);
  config.fx = { EUR: 1, CHF: 0.94, GBP: 0.86, USD: 1.17 };
  config.tax.vatMode = "kleinunternehmer";
  config.tax.countries = {
    DE: { vatRate: 0.19, saleVat: "followVatMode", importVatMinimum: 0, importVatCollectedAtSaleBelow: null },
    AT: { vatRate: 0.2, saleVat: "followVatMode", importVatMinimum: 0, importVatCollectedAtSaleBelow: null },
    CH: { vatRate: 0.081, saleVat: "never", importVatMinimum: 5, importVatCollectedAtSaleBelow: null },
    GB: { vatRate: 0.2, saleVat: "always", importVatMinimum: 0, importVatCollectedAtSaleBelow: 135 },
  };
  config.customs = {
    DE: { lowValueThreshold: 150, lowValueRule: { type: "flatPerItem", amount: 3 }, tariffZone: "EU", clearanceFeePerItem: 0 },
    AT: { lowValueThreshold: 150, lowValueRule: { type: "flatPerItem", amount: 3 }, tariffZone: "EU", clearanceFeePerItem: 0 },
    CH: { lowValueThreshold: 0, lowValueRule: { type: "none" }, tariffZone: "CH", clearanceFeePerItem: 5 },
    GB: { lowValueThreshold: 135, lowValueRule: { type: "none" }, tariffZone: "GB", clearanceFeePerItem: 0 },
  };
  config.categories.beleuchtung.dutyRate = { EU: 0.047, GB: 0.02, CH: 0 };
  config.categories.beleuchtung.retailMultiplier = 3.2;
  config.shipping.perItemEur = { DE: 3.5, AT: 3.9, CH: 4.5, GB: 3.9 };
  config.fees = { paymentFeePct: 0.021, paymentFeeFixedEur: 0.3 };
  config.margin = { minMarginPct: 0.2, targetMarginPct: 0.55, minMarginAbsEur: 8 };
  config.trend = {
    recentWeeks: 4,
    previousWeeks: 4,
    growthFloor: 5,
    growthHalfSaturation: 1,
    earlyBaselineCap: 30,
    minRecentInterest: 5,
    requireContinuousRecentInterest: true,
    minSeriesWeeks: 16,
    weights: { growth: 0.55, early: 0.35, level: 0.1 },
  };
  config.competition = { resultCountLogCap: 5, ordersLogCap: 5, advertisersLogCap: 2, weights: { results: 0.25, orders: 0.25, advertisers: 0.5 } };
  config.score = { weights: { trend: 0.5, margin: 0.35, competition: 0.15 }, relevanceExponent: 1 };
  return config;
}
