import { describe, expect, it } from "vitest";
import { makeTestConfig } from "@/scoring/test-config";
import { EbayMockSource } from "./ebay.mock";
import { parseListings, summarizeListings } from "./ebay";

const config = makeTestConfig();

// Aufbau laut Browse-API-Doku (item_summary/search → itemSummaries[])
const item = (price: string, country: string, currency = "EUR") => ({
  itemId: "v1|1|0",
  title: "Wolkenlampe LED",
  price: { value: price, currency },
  itemLocation: { postalCode: "10115", country },
  seller: { username: "privat123", feedbackPercentage: "99.1" },
});

describe("parseListings", () => {
  it("liest Preis, Währung und Versandort und verwirft Verkäuferdaten", () => {
    const [listing] = parseListings([item("19.99", "DE")]);
    expect(listing).toEqual({ title: "Wolkenlampe LED", price: 19.99, currency: "EUR", location: "DE" });
  });

  it("überspringt Einträge ohne Preis nicht, markiert aber den Preis als unbekannt", () => {
    const [listing] = parseListings([{ title: "Ohne Preis", itemLocation: { country: "CN" } }]);
    expect(listing).toMatchObject({ price: null, location: "CN" });
  });
});

describe("summarizeListings", () => {
  it("rechnet Asien-Direktversand aus dem Preis heraus und zählt ihn als Anteil", () => {
    const listings = parseListings([
      item("20", "DE"),
      item("22", "DE"),
      item("24", "AT"),
      item("26", "DE"),
      item("30", "PL"),
      item("6", "CN"),
      item("7", "HK"),
      item("5", "CN"),
    ]);
    const summary = summarizeListings(1234, listings, "DE", config);
    expect(summary.totalListings).toBe(1234);
    expect(summary.asiaShare).toBeCloseTo(3 / 8, 3);
    expect(summary.prices).toEqual([20, 22, 24, 26, 30]);
    expect(summary.medianPrice).toBe(24);
  });

  it("liefert keinen Preis bei zu kleiner Stichprobe, aber die Angebotszahl", () => {
    const summary = summarizeListings(3, parseListings([item("20", "DE"), item("6", "CN"), item("7", "CN")]), "DE", config);
    expect(summary.medianPrice).toBeNull();
    expect(summary.totalListings).toBe(3);
  });

  it("ignoriert Preise in fremder Währung", () => {
    const listings = parseListings(["10", "11", "12", "13", "14"].map((p) => item(p, "DE", "EUR")));
    expect(summarizeListings(5, listings, "GB", config).medianPrice).toBeNull();
  });

  it("kommt mit null Treffern zurecht", () => {
    expect(summarizeListings(0, [], "DE", config)).toEqual({ totalListings: 0, asiaShare: null, prices: [], medianPrice: null });
  });
});

describe("EbayMockSource", () => {
  it("zeigt frühe Trends mit wenigen Angeboten, gesättigte Produkte mit vielen", async () => {
    const source = new EbayMockSource();
    const early = await source.marketActivity("wolkenlampe", "DE");
    const saturated = await source.marketActivity("sonnenuntergang lampe", "DE");
    expect(saturated.totalListings).toBeGreaterThan(early.totalListings * 5);
    expect(saturated.price?.currency).toBe("EUR");
  });
});
