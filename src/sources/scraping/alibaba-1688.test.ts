import { describe, expect, it } from "vitest";
import { normalize1688Item, parsePriceTiers } from "./alibaba-1688";
import { Alibaba1688MockSource } from "./alibaba-1688.mock";

describe("parsePriceTiers", () => {
  it("liest Mengenbereiche wie „1~9个“ und „≥150个“", () => {
    expect(
      parsePriceTiers([
        { range: "≥150个", price: 5.7 },
        { range: "1~9个", price: "6.70" },
        { range: "10~149个", price: 6.2 },
      ]),
    ).toEqual([
      { minQty: 1, price: 6.7 },
      { minQty: 10, price: 6.2 },
      { minQty: 150, price: 5.7 },
    ]);
  });

  it("ignoriert Unlesbares", () => {
    expect(parsePriceTiers([{ foo: 1 }, null, { range: "ab", price: 3 }])).toEqual([]);
    expect(parsePriceTiers("x")).toEqual([]);
  });
});

describe("normalize1688Item", () => {
  it("normalisiert einen Eintrag mit alternativen Feldnamen", () => {
    const record = normalize1688Item(
      { offer_id: 123, subject: "云朵灯", price: "12.5", sales: "3000+", quantityBegin: 2 },
      "cloud lamp",
      "DE",
      new Date(0),
    );
    expect(record).toMatchObject({
      source: "alibaba-1688",
      externalId: "123",
      title: "云朵灯",
      price: 12.5,
      currency: "CNY",
      orders30d: 3000,
      moq: 2,
      sourcingModel: "wholesale",
      url: "https://detail.1688.com/offer/123.html",
    });
  });

  it("verwirft Einträge ohne ID, Titel oder Preis", () => {
    expect(normalize1688Item({ title: "x" }, "k", "DE", new Date(0))).toBeNull();
  });
});

describe("Alibaba1688MockSource", () => {
  const source = new Alibaba1688MockSource();

  it("liefert Großhandelsangebote mit Staffeln für DE", async () => {
    const offers = await source.search("wolkenlampe", "DE", 8);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers[0]?.priceTiers?.length).toBe(4);
    expect(offers[0]?.sourcingModel).toBe("wholesale");
  });

  it("liefert nichts für Länder ohne Lager-Belieferung", async () => {
    expect(await source.search("wolkenlampe", "GB", 8)).toEqual([]);
  });
});
