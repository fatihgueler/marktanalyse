import { describe, expect, it } from "vitest";
import { calculateWholesaleMargin, tierPrice, type WholesaleMarginInput } from "./margin";
import { makeTestConfig } from "./test-config";

const tiers = [
  { minQty: 1, price: 48 },
  { minQty: 50, price: 44 },
  { minQty: 200, price: 40 },
  { minQty: 1000, price: 36 },
];

describe("tierPrice", () => {
  it("wählt die höchste erreichte Staffel", () => {
    expect(tierPrice(48, tiers, 200)).toEqual({ minQty: 200, price: 40 });
    expect(tierPrice(48, tiers, 999)).toEqual({ minQty: 200, price: 40 });
    expect(tierPrice(48, tiers, 10)).toEqual({ minQty: 1, price: 48 });
  });

  it("fällt ohne Staffeln auf den Basispreis zurück", () => {
    expect(tierPrice(12, [], 500)).toEqual({ minQty: 1, price: 12 });
  });
});

const input: WholesaleMarginInput = {
  country: "DE",
  category: "beleuchtung",
  basePrice: 48,
  priceTiers: tiers,
  purchaseCurrency: "CNY",
  moq: 2,
  weightKg: null,
  referencePrice: 34.99,
  referenceCurrency: "EUR",
};

describe("calculateWholesaleMargin", () => {
  it("rechnet Sammelimport nach DE als Kleinunternehmer (Handrechnung)", () => {
    const m = calculateWholesaleMargin(input, makeTestConfig());
    const purchase = 40 / 8; // Staffel ab 200 Stück, 8 CNY = 1 EUR
    const freight = 0.6 * 6.5; // Standardgewicht Beleuchtung
    const duty = (purchase + freight) * 0.047; // regulärer EU-Zoll, keine Kleinsendungspauschale
    const importVat = (purchase + freight + duty) * 0.19;
    const landed = purchase + purchase * 0.08 + freight + duty + importVat + 60 / 200 + 4.5;
    expect(m.purchase).toBeCloseTo(5);
    expect(m.wholesale?.lotSize).toBe(200);
    expect(m.wholesale?.agentFee).toBeCloseTo(0.4);
    expect(m.shipping).toBeCloseTo(3.9);
    expect(m.duty).toBeCloseTo(duty);
    expect(m.importVat).toBeCloseTo(importVat);
    expect(m.clearanceFee).toBeCloseTo(0.3);
    expect(m.landedCost).toBeCloseTo(landed);
    expect(m.marginAbs).toBeCloseTo(34.99 - landed - (34.99 * 0.021 + 0.3));
  });

  it("erhöht die Losgröße auf die Mindestbestellmenge", () => {
    const m = calculateWholesaleMargin({ ...input, moq: 1000 }, makeTestConfig());
    expect(m.wholesale?.lotSize).toBe(1000);
    expect(m.purchase).toBeCloseTo(36 / 8);
    expect(m.clearanceFee).toBeCloseTo(60 / 1000);
  });

  it("nutzt das Gewicht der Quelle, wenn vorhanden", () => {
    const m = calculateWholesaleMargin({ ...input, weightKg: 0.2 }, makeTestConfig());
    expect(m.shipping).toBeCloseTo(1.3);
    expect(m.wholesale?.weightSource).toBe("quelle");
  });

  it("zieht die EUSt bei Regelbesteuerung als Vorsteuer ab", () => {
    const config = makeTestConfig();
    config.tax.vatMode = "regelbesteuert";
    const m = calculateWholesaleMargin(input, config);
    expect(m.importVatDeductible).toBe(true);
    expect(m.effectiveCost).toBeCloseTo(m.landedCost - m.importVat);
    expect(m.netRevenue).toBeCloseTo(34.99 / 1.19);
  });

  it("rechnet Lieferungen nach AT mit EUSt aus DE und höherem Versand", () => {
    const m = calculateWholesaleMargin({ ...input, country: "AT" }, makeTestConfig());
    expect(m.importVatRule).toMatch(/DE/);
    expect(m.wholesale?.lastMile).toBeCloseTo(6.9);
  });

  it("verweigert Länder ohne Lager-Belieferung", () => {
    expect(() => calculateWholesaleMargin({ ...input, country: "GB", referenceCurrency: "GBP" }, makeTestConfig())).toThrow(/nicht konfiguriert/);
  });
});
