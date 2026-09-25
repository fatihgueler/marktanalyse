import { describe, expect, it } from "vitest";
import { calculateMargin, convertCurrency, fallbackReferencePrice, type MarginInput } from "./margin";
import { makeTestConfig } from "./test-config";

const baseInput: MarginInput = {
  country: "DE",
  category: "beleuchtung",
  purchasePrice: 10,
  purchaseCurrency: "EUR",
  shippingCost: null,
  shippingCurrency: "EUR",
  referencePrice: 34.99,
  referenceCurrency: "EUR",
};

describe("convertCurrency", () => {
  it("rechnet über EUR als Basis", () => {
    const config = makeTestConfig();
    expect(convertCurrency(10, "EUR", "GBP", config.fx)).toBeCloseTo(8.6);
    expect(convertCurrency(8.6, "GBP", "EUR", config.fx)).toBeCloseTo(10);
    expect(convertCurrency(10, "GBP", "CHF", config.fx)).toBeCloseTo((10 / 0.86) * 0.94);
  });

  it("wirft bei unbekannter Währung", () => {
    expect(() => convertCurrency(1, "JPY", "EUR", makeTestConfig().fx)).toThrow(/Wechselkurs/);
  });
});

describe("calculateMargin – Deutschland", () => {
  it("Kleinunternehmer: EUSt ist Kostenfaktor, keine USt auf den Verkauf (Handrechnung)", () => {
    const m = calculateMargin(baseInput, makeTestConfig());
    expect(m.shipping).toBeCloseTo(3.5);
    expect(m.shippingSource).toBe("config");
    expect(m.customsValue).toBeCloseTo(13.5);
    expect(m.duty).toBeCloseTo(3); // Kleinsendung < 150 €: 3 € Pauschale
    expect(m.importVat).toBeCloseTo(3.135); // (13,5 + 3) · 19 %
    expect(m.landedCost).toBeCloseTo(19.635);
    expect(m.sellerChargesVat).toBe(false);
    expect(m.netRevenue).toBeCloseTo(34.99);
    expect(m.effectiveCost).toBeCloseTo(19.635);
    expect(m.paymentFees).toBeCloseTo(1.03479); // 34,99 · 2,1 % + 0,30
    expect(m.marginAbs).toBeCloseTo(14.32021);
    expect(m.marginPct).toBeCloseTo(14.32021 / 34.99);
    expect(m.score).toBeCloseTo((14.32021 / 34.99 - 0.2) / 0.35);
    expect(m.belowMinMargin).toBe(false);
  });

  it("Regelbesteuert: USt herausrechnen, EUSt als Vorsteuer abziehen", () => {
    const config = makeTestConfig();
    config.tax.vatMode = "regelbesteuert";
    const m = calculateMargin(baseInput, config);
    expect(m.landedCost).toBeCloseTo(19.635); // Landed Cost bleibt inkl. EUSt
    expect(m.netRevenue).toBeCloseTo(34.99 / 1.19);
    expect(m.saleVat).toBeCloseTo(34.99 - 34.99 / 1.19);
    expect(m.importVatDeductible).toBe(true);
    expect(m.effectiveCost).toBeCloseTo(16.5);
    expect(m.marginAbs).toBeCloseTo(34.99 / 1.19 - 16.5 - 1.03479);
  });

  it("wendet oberhalb der Kleinsendungsgrenze den Kategorie-Zollsatz an", () => {
    const m = calculateMargin({ ...baseInput, purchasePrice: 200, referencePrice: 499 }, makeTestConfig());
    expect(m.customsValue).toBeCloseTo(203.5);
    expect(m.duty).toBeCloseTo(203.5 * 0.047);
    expect(m.importVat).toBeCloseTo((203.5 + 203.5 * 0.047) * 0.19);
  });

  it("nutzt Versandkosten aus der Quelle, wenn vorhanden", () => {
    const m = calculateMargin({ ...baseInput, shippingCost: 1.2 }, makeTestConfig());
    expect(m.shipping).toBeCloseTo(1.2);
    expect(m.shippingSource).toBe("quelle");
  });

  it("markiert Kandidaten unter der Mindestmarge und begrenzt den Score auf 0", () => {
    const m = calculateMargin({ ...baseInput, referencePrice: 19.99 }, makeTestConfig());
    expect(m.marginAbs).toBeLessThan(8);
    expect(m.belowMinMargin).toBe(true);
    expect(m.score).toBe(0);
  });

  it("begrenzt den Score bei sehr hoher Marge auf 1", () => {
    const m = calculateMargin({ ...baseInput, referencePrice: 200 }, makeTestConfig());
    expect(m.score).toBe(1);
  });
});

describe("calculateMargin – Vereinigtes Königreich", () => {
  it("≤ 135 £: kein Zoll, keine Einfuhr-USt, VAT 20 % beim Verkauf (Handrechnung)", () => {
    const m = calculateMargin({ ...baseInput, country: "GB", referencePrice: 29.99, referenceCurrency: "GBP" }, makeTestConfig());
    expect(m.currency).toBe("GBP");
    expect(m.purchase).toBeCloseTo(8.6);
    expect(m.shipping).toBeCloseTo(3.354); // 3,90 € · 0,86
    expect(m.customsValue).toBeCloseTo(11.954);
    expect(m.duty).toBe(0);
    expect(m.importVat).toBe(0);
    expect(m.landedCost).toBeCloseTo(11.954);
    // UK-VAT ist für ausländische Händler Pflicht – unabhängig vom Kleinunternehmer-Status
    expect(m.sellerChargesVat).toBe(true);
    expect(m.netRevenue).toBeCloseTo(29.99 / 1.2);
    expect(m.paymentFees).toBeCloseTo(29.99 * 0.021 + 0.3 * 0.86);
    expect(m.marginAbs).toBeCloseTo(29.99 / 1.2 - 11.954 - (29.99 * 0.021 + 0.258));
  });

  it("> 135 £: Zoll und abziehbare Einfuhr-USt", () => {
    const m = calculateMargin(
      { ...baseInput, country: "GB", purchasePrice: 200, referencePrice: 399, referenceCurrency: "GBP" },
      makeTestConfig(),
    );
    const customsValue = 172 + 3.354;
    expect(m.customsValue).toBeCloseTo(customsValue);
    expect(m.duty).toBeCloseTo(customsValue * 0.02);
    expect(m.importVat).toBeCloseTo((customsValue * 1.02) * 0.2);
    expect(m.importVatDeductible).toBe(true);
    expect(m.effectiveCost).toBeCloseTo(customsValue * 1.02);
  });
});

describe("calculateMargin – Schweiz", () => {
  it("erhebt keine EUSt unter CHF 5 und keine Abfertigungsgebühr", () => {
    const m = calculateMargin({ ...baseInput, country: "CH", referencePrice: 39.9, referenceCurrency: "CHF" }, makeTestConfig());
    // Zollwert (10 + 4,5) · 0,94 = 13,63 CHF → EUSt 1,10 CHF < 5 → 0
    expect(m.duty).toBe(0);
    expect(m.importVat).toBe(0);
    expect(m.clearanceFee).toBe(0);
    expect(m.sellerChargesVat).toBe(false);
  });

  it("erhebt EUSt und Abfertigungsgebühr bei höherem Warenwert", () => {
    const m = calculateMargin({ ...baseInput, country: "CH", purchasePrice: 80, referencePrice: 199, referenceCurrency: "CHF" }, makeTestConfig());
    const customsValue = (80 + 4.5) * 0.94;
    expect(m.importVat).toBeCloseTo(customsValue * 0.081);
    expect(m.clearanceFee).toBe(5);
    expect(m.landedCost).toBeCloseTo(customsValue * 1.081 + 5);
  });
});

describe("fallbackReferencePrice", () => {
  it("multipliziert den Einkaufspreis in Landeswährung mit dem Kategorie-Faktor", () => {
    const config = makeTestConfig();
    expect(fallbackReferencePrice(10, "EUR", "DE", "beleuchtung", config)).toBeCloseTo(32);
    expect(fallbackReferencePrice(10, "EUR", "GB", "beleuchtung", config)).toBeCloseTo(8.6 * 3.2);
  });
});
