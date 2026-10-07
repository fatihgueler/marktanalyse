import { describe, expect, it } from "vitest";
import { checkProduct, checkVerdict, sourcingFromUrl, trendPhase } from "./product-check";
import { calculateMargin } from "./margin";
import { makeTestConfig } from "./test-config";
import { scoreTrend } from "./trend";

const config = makeTestConfig();
const base = {
  country: "DE" as const,
  category: "beleuchtung" as const,
  purchasePrice: 6,
  purchaseCurrency: "EUR",
  shippingCost: 2,
  weightKg: null,
  plannedPrice: 39.9,
  sourcing: "einzeln" as const,
};

describe("checkProduct", () => {
  it("rechnet mit derselben Kalkulation wie der automatische Lauf", () => {
    const result = checkProduct(base, config);
    const expected = calculateMargin(
      { country: "DE", category: "beleuchtung", purchasePrice: 6, purchaseCurrency: "EUR", shippingCost: 2, shippingCurrency: "EUR", referencePrice: 39.9, referenceCurrency: "EUR" },
      config,
    );
    expect(result.margin).toEqual(expected);
    expect(result.priceEstimated).toBe(false);
    expect(result.maxAdSpend).toBeCloseTo(expected.marginAbs);
  });

  it("schätzt den Verkaufspreis über den Kategorie-Faktor und kennzeichnet ihn", () => {
    const result = checkProduct({ ...base, plannedPrice: null }, config);
    expect(result.priceEstimated).toBe(true);
    expect(result.margin.referencePrice).toBeCloseTo(6 * config.categories.beleuchtung.retailMultiplier);
  });

  it("gibt bei Verlust kein negatives Werbebudget aus", () => {
    const result = checkProduct({ ...base, plannedPrice: 9.99 }, config);
    expect(result.margin.marginAbs).toBeLessThan(0);
    expect(result.maxAdSpend).toBe(0);
    expect(result.verdict).toBe("Finger weg");
  });

  it("rechnet 1688-Links als Großhandel und lehnt Länder ohne Lager ab", () => {
    const wholesale = checkProduct({ ...base, purchaseCurrency: "CNY", purchasePrice: 30, sourcing: "grosshandel", weightKg: 0.5 }, config);
    expect(wholesale.margin.wholesale?.weightKg).toBe(0.5);
    expect(() => checkProduct({ ...base, country: "GB", sourcing: "grosshandel" }, config)).toThrow(/Großhandel/);
  });
});

describe("checkVerdict", () => {
  const margin = (marginPct: number, marginAbs: number) => ({ ...checkProduct(base, config).margin, marginPct, marginAbs });
  it("verlangt für „Lohnt sich“ beide Schwellen", () => {
    expect(checkVerdict(margin(0.4, 20), config).verdict).toBe("Lohnt sich");
    expect(checkVerdict(margin(0.4, 10), config).verdict).toBe("Knapp");
    expect(checkVerdict(margin(0.25, 20), config).verdict).toBe("Knapp");
  });
  it("sagt „Finger weg“ unter der Mindestmarge", () => {
    expect(checkVerdict(margin(0.15, 20), config).verdict).toBe("Finger weg");
    expect(checkVerdict(margin(0.5, 5), config).verdict).toBe("Finger weg");
  });
});

describe("sourcingFromUrl", () => {
  it("erkennt 1688, sonst Einzelversand", () => {
    expect(sourcingFromUrl("https://detail.1688.com/offer/123.html")).toBe("grosshandel");
    expect(sourcingFromUrl("https://de.aliexpress.com/item/1.html")).toBe("einzeln");
    expect(sourcingFromUrl("https://www.temu.com/x.html")).toBe("einzeln");
    expect(sourcingFromUrl(null)).toBe("einzeln");
    expect(sourcingFromUrl("kein link")).toBe("einzeln");
  });
});

describe("trendPhase", () => {
  const weeks = (old: number, previous: number, recent: number) => [...Array(44).fill(old), ...Array(4).fill(previous), ...Array(4).fill(recent)];
  it("unterscheidet Frühphase, Wachstum, kein Anstieg und Rauschen", () => {
    expect(trendPhase(scoreTrend(weeks(2, 20, 80), config.trend), config)).toBe("Frühphase");
    expect(trendPhase(scoreTrend(weeks(60, 50, 80), config.trend), config)).toBe("Wachstum");
    expect(trendPhase(scoreTrend(weeks(40, 60, 50), config.trend), config)).toBe("Kein Anstieg");
    expect(trendPhase(scoreTrend(weeks(1, 1, 2), config.trend), config)).toBe("Rauschen");
  });
});
