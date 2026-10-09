import { describe, expect, it } from "vitest";
import { implausiblePurchase } from "./plausibility";
import { makeTestConfig } from "./test-config";

const config = makeTestConfig(); // 8 CNY = 1 EUR, Los 200

describe("implausiblePurchase", () => {
  it("verwirft den Platzhalterpreis aus dem Live-Lauf (Plüsch-Kürbis für 90.011,94 CNY)", () => {
    const result = implausiblePurchase({ price: 90011.94, currency: "CNY", priceTiers: [], referencePrice: 23.42, referenceCurrency: "EUR" }, config);
    expect(result?.purchaseEur).toBeCloseTo(11251.49, 2);
    expect(result?.referenceEur).toBe(23.42);
  });

  it("lässt normale Angebote durch", () => {
    expect(implausiblePurchase({ price: 48, currency: "CNY", priceTiers: [], referencePrice: 34.99, referenceCurrency: "EUR" }, config)).toBeNull();
  });

  it("vergleicht beim Großhandel den Stückpreis der Staffel bei der Losgröße", () => {
    // 1 Stück: 400 CNY = 50 € (über 40 €), ab 200 Stück: 240 CNY = 30 € → plausibel
    const tiers = [
      { minQty: 1, price: 400 },
      { minQty: 200, price: 240 },
    ];
    expect(implausiblePurchase({ price: 400, currency: "CNY", priceTiers: tiers, referencePrice: 40, referenceCurrency: "EUR" }, config)).toBeNull();
  });
});
