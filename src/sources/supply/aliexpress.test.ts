import { afterEach, describe, expect, it, vi } from "vitest";
import { AliExpressSource, parseShippingResponse } from "./aliexpress";

const shippingResponse = (result: Record<string, unknown> | null, code = 200) => ({
  aliexpress_affiliate_product_shipping_get_response: { resp_result: { resp_code: code, resp_msg: "ok", result } },
});

describe("parseShippingResponse", () => {
  it("liest Versandkosten und Lieferzeit (Felder laut Doku als Text)", () => {
    const quote = parseShippingResponse(
      shippingResponse({ shipping_fee: "2.99", min_delivery_days: "7", max_delivery_days: "12", delivery_days: "9", ship_from_country: "CN" }),
    );
    expect(quote).toEqual({ fee: 2.99, delivery: { minDays: 7, maxDays: 12, shipFrom: "CN" } });
  });

  it("nimmt delivery_days, wenn Minimum und Maximum fehlen, und kostenlosen Versand als 0", () => {
    const quote = parseShippingResponse(shippingResponse({ shipping_fee: "0", delivery_days: "5", ship_from_country: "" }));
    expect(quote).toEqual({ fee: 0, delivery: { minDays: 5, maxDays: 5, shipFrom: null } });
  });

  it("liefert null, wenn AliExpress keinen Versand ins Land kennt", () => {
    expect(parseShippingResponse(shippingResponse(null, 405))).toBeNull();
  });

  it("meldet API-Fehler und geänderte Formate", () => {
    expect(() => parseShippingResponse({ error_response: { code: "IncompleteSignature", msg: "bad sign" } })).toThrow(/IncompleteSignature/);
    expect(() => parseShippingResponse({ data: {} })).toThrow(/Antwortstruktur/);
  });
});

describe("AliExpressSource.search", () => {
  afterEach(() => vi.unstubAllGlobals());

  const product = (id: string, extra: Record<string, unknown> = {}) => ({
    product_id: id,
    product_title: `Produkt ${id}`,
    product_detail_url: `https://www.aliexpress.com/item/${id}.html`,
    target_sale_price: "6.50",
    target_sale_price_currency: "EUR",
    lastest_volume: 500,
    sku_id: `${id}01`,
    tax_rate: "0.19",
    ...extra,
  });

  it("holt Versand für die ersten N Treffer, der Rest rechnet mit der Pauschale", async () => {
    const bodies: URLSearchParams[] = [];
    const responses = [
      {
        aliexpress_affiliate_product_query_response: {
          resp_result: { resp_code: 200, result: { total_record_count: 900, products: { product: [product("1"), product("2", { sku_id: undefined }), product("3")] } } },
        },
      },
      shippingResponse({ shipping_fee: "1.50", min_delivery_days: "8", max_delivery_days: "14", ship_from_country: "CN" }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(new URLSearchParams(String(init.body)));
        return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );

    const source = new AliExpressSource({ appKey: "k", appSecret: "s", trackingId: "t" }, 2);
    const offers = await source.search("wolkenlampe", "DE", 12);

    expect(offers.map((o) => o.shippingCost)).toEqual([1.5, null, null]);
    expect(offers[0]?.delivery).toEqual({ minDays: 8, maxDays: 14, shipFrom: "CN" });
    // Produkt 2 ohne SKU-ID: Abfrage nicht möglich → Hinweis; Produkt 3 liegt außerhalb der ersten zwei → keine Abfrage
    expect(offers[1]?.shippingError).toMatch(/SKU-ID/);
    expect(offers[2]?.shippingError).toBeUndefined();

    const shippingCall = bodies[1]!;
    expect(shippingCall.get("method")).toBe("aliexpress.affiliate.product.shipping.get");
    expect(Object.fromEntries(["product_id", "sku_id", "ship_to_country", "target_currency", "target_sale_price", "tax_rate"].map((k) => [k, shippingCall.get(k)]))).toEqual({
      product_id: "1",
      sku_id: "101",
      ship_to_country: "DE",
      target_currency: "EUR",
      target_sale_price: "6.5",
      tax_rate: "0.19",
    });
    expect(shippingCall.get("sign")).toMatch(/^[0-9A-F]{64}$/);
    expect(bodies).toHaveLength(2);
  });
});
