import { radarConfig, type RadarConfig } from "@/config/radar.config";
import { convertCurrency, tierPrice } from "./margin";
import type { PriceTier } from "@/sources/types";

export interface PlausibilityInput {
  /** Stückpreis laut Quelle (Originalwährung) */
  price: number;
  currency: string;
  /** Großhandel: Staffeln und Mindestmenge – verglichen wird der Stückpreis bei der Losgröße */
  priceTiers?: PriceTier[];
  moq?: number | null;
  referencePrice: number;
  referenceCurrency: string;
}

/**
 * Einkaufspreis je Stück über dem Verkaufspreis anderer Shops? Dann ist das Angebot ein Ausreißer
 * (Platzhalterpreis wie 90.011 CNY, Ladeninstallation statt Endkundenprodukt) und wird verworfen.
 * Rückgabe: Einkauf und Referenz in EUR, wenn unplausibel, sonst null.
 */
export function implausiblePurchase(input: PlausibilityInput, config: RadarConfig = radarConfig): { purchaseEur: number; referenceEur: number } | null {
  const lotSize = Math.max(config.wholesale.lotSize, input.moq ?? 0);
  const unit = input.priceTiers ? tierPrice(input.price, input.priceTiers, lotSize).price : input.price;
  const purchaseEur = convertCurrency(unit, input.currency, "EUR", config.fx);
  const referenceEur = convertCurrency(input.referencePrice, input.referenceCurrency, "EUR", config.fx);
  return purchaseEur > referenceEur ? { purchaseEur, referenceEur } : null;
}
