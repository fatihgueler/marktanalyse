import { z } from "zod";
import { radarConfig, type Country } from "@/config/radar.config";
import { Throttle, fetchJson } from "../http";
import type { DeliveryEstimate, SupplyRecord, SupplySource } from "../types";
import { signAliExpressParams } from "./aliexpress.sign";

const GATEWAY_URL = "https://api-sg.aliexpress.com/sync";
const METHOD = "aliexpress.affiliate.product.query";
/** Versandkosten und Lieferzeit je Angebot (kostenlos); braucht SKU-ID und Steuersatz aus der Produktsuche */
const SHIPPING_METHOD = "aliexpress.affiliate.product.shipping.get";
/** Maximum der API je Seite */
const MAX_PAGE_SIZE = 50;

export interface AliExpressCredentials {
  appKey: string;
  appSecret: string;
  trackingId: string;
}

const numeric = z.union([z.number(), z.string()]).transform((value) => Number(value));

const productSchema = z.object({
  product_id: z.union([z.number(), z.string()]).transform(String),
  product_title: z.string(),
  product_detail_url: z.string(),
  product_main_image_url: z.string().optional(),
  target_sale_price: numeric,
  target_sale_price_currency: z.string().optional(),
  lastest_volume: numeric.optional(),
  evaluate_rate: z.string().optional(),
  sku_id: z.union([z.number(), z.string()]).transform(String).optional(),
  tax_rate: z.union([z.number(), z.string()]).transform(String).optional(),
});

type AliExpressProduct = z.infer<typeof productSchema>;

const errorSchema = z.object({ code: z.union([z.string(), z.number()]), msg: z.string().optional() });

const responseSchema = z.object({
  error_response: errorSchema.optional(),
  aliexpress_affiliate_product_query_response: z
    .object({
      resp_result: z.object({
        resp_code: z.number(),
        resp_msg: z.string().optional(),
        result: z
          .object({
            total_record_count: numeric.optional(),
            products: z.object({ product: z.array(productSchema) }).optional(),
          })
          .optional(),
      }),
    })
    .optional(),
});

/** Alle Felder kommen laut Doku als Text; leere oder kaputte Werte werden zu null. */
const optionalNumber = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((value) => {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  });

const shippingResponseSchema = z.object({
  error_response: errorSchema.optional(),
  aliexpress_affiliate_product_shipping_get_response: z
    .object({
      resp_result: z.object({
        resp_code: z.number(),
        resp_msg: z.string().optional(),
        result: z
          .object({
            shipping_fee: optionalNumber,
            min_delivery_days: optionalNumber,
            max_delivery_days: optionalNumber,
            delivery_days: optionalNumber,
            ship_from_country: z.string().optional().nullable(),
          })
          .optional()
          .nullable(),
      }),
    })
    .optional(),
});

export interface ShippingQuote {
  /** in der Währung der Anfrage (EUR) */
  fee: number | null;
  delivery: DeliveryEstimate;
}

/** Antwort der Versandabfrage lesen; null = AliExpress kennt für dieses Angebot keinen Versand ins Land. */
export function parseShippingResponse(json: unknown): ShippingQuote | null {
  const parsed = shippingResponseSchema.parse(json);
  if (parsed.error_response) {
    throw new Error(`AliExpress-Fehler ${parsed.error_response.code}: ${parsed.error_response.msg ?? "unbekannt"}`);
  }
  const result = parsed.aliexpress_affiliate_product_shipping_get_response?.resp_result;
  if (!result) throw new Error("AliExpress-Versand: unerwartete Antwortstruktur");
  if (result.resp_code !== 200 || !result.result) return null;
  const r = result.result;
  const days = r.delivery_days;
  return {
    fee: r.shipping_fee,
    delivery: {
      minDays: r.min_delivery_days ?? days,
      maxDays: r.max_delivery_days ?? days,
      shipFrom: r.ship_from_country?.trim() || null,
    },
  };
}

/** "96.5%" → 96.5 */
function parsePercent(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** AliExpress Open Platform – Affiliate-Produktsuche. */
export class AliExpressSource implements SupplySource {
  readonly id = "aliexpress";
  readonly label = "AliExpress";
  readonly mode = "live" as const;
  private readonly throttle = new Throttle();

  constructor(
    private readonly credentials: AliExpressCredentials,
    private readonly shippingLookups: number = radarConfig.supply.shippingLookupsPerSearch,
  ) {}

  /** Signierter Aufruf des Gateways (App-Key, Zeitstempel und Signatur werden ergänzt). */
  private async call(method: string, businessParams: Record<string, string>): Promise<unknown> {
    const params: Record<string, string> = {
      method,
      app_key: this.credentials.appKey,
      sign_method: "sha256",
      timestamp: String(Date.now()),
      ...businessParams,
    };
    params.sign = signAliExpressParams(params, this.credentials.appSecret);
    return fetchJson<unknown>(
      GATEWAY_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: new URLSearchParams(params).toString(),
      },
      this.throttle,
    );
  }

  /** Versandkosten und Lieferzeit für ein Angebot aus der Produktsuche. */
  async shippingQuote(product: AliExpressProduct, shipTo: Country): Promise<ShippingQuote | null> {
    if (!product.sku_id || product.tax_rate === undefined) throw new Error("Produktsuche lieferte keine SKU-ID oder keinen Steuersatz");
    const profile = radarConfig.countries[shipTo];
    const json = await this.call(SHIPPING_METHOD, {
      product_id: product.product_id,
      sku_id: product.sku_id,
      ship_to_country: profile.aliexpressShipTo,
      target_currency: "EUR",
      target_sale_price: String(product.target_sale_price),
      target_language: profile.aliexpressLanguage,
      tax_rate: product.tax_rate,
    });
    return parseShippingResponse(json);
  }

  async search(keyword: string, shipTo: Country, limit: number): Promise<SupplyRecord[]> {
    const profile = radarConfig.countries[shipTo];
    const params: Record<string, string> = {
      // ANNAHME: Suche mit dem Keyword in Landessprache; AliExpress übersetzt DE-Suchbegriffe intern.
      keywords: keyword,
      page_no: "1",
      page_size: String(Math.min(limit, MAX_PAGE_SIZE)),
      sort: "LAST_VOLUME_DESC",
      // ANNAHME: Preise immer in EUR anfordern und per Config-Kurs umrechnen – einheitliche Basis für alle Länder.
      target_currency: "EUR",
      target_language: profile.aliexpressLanguage,
      ship_to_country: profile.aliexpressShipTo,
      tracking_id: this.credentials.trackingId,
    };
    const parsed = responseSchema.parse(await this.call(METHOD, params));
    if (parsed.error_response) {
      throw new Error(`AliExpress-Fehler ${parsed.error_response.code}: ${parsed.error_response.msg ?? "unbekannt"}`);
    }
    const result = parsed.aliexpress_affiliate_product_query_response?.resp_result;
    if (!result) throw new Error("AliExpress: unerwartete Antwortstruktur");
    // resp_code 405 = keine Treffer
    if (result.resp_code !== 200) return [];

    const products = result.result?.products?.product ?? [];
    const resultCount = result.result?.total_record_count ?? null;
    const fetchedAt = new Date();

    const shown = products.slice(0, limit);
    // Versand nur für die meistverkauften Treffer abfragen (Liste ist nach Verkäufen sortiert).
    const quotes = new Map<string, ShippingQuote | null>();
    const failures = new Map<string, string>();
    for (const product of shown.slice(0, this.shippingLookups)) {
      try {
        quotes.set(product.product_id, await this.shippingQuote(product, shipTo));
      } catch (error) {
        failures.set(product.product_id, error instanceof Error ? error.message : String(error));
      }
    }

    return shown.map((product) => ({
      source: this.id,
      country: shipTo,
      fetchedAt,
      externalId: product.product_id,
      keyword,
      title: product.product_title,
      url: product.product_detail_url,
      imageUrl: product.product_main_image_url ?? null,
      price: product.target_sale_price,
      currency: product.target_sale_price_currency ?? "EUR",
      // Ohne Versandabfrage (oder ohne Preis darin) greift die Pauschale aus der Config.
      shippingCost: quotes.get(product.product_id)?.fee ?? null,
      delivery: quotes.get(product.product_id)?.delivery ?? null,
      ...(failures.has(product.product_id) ? { shippingError: failures.get(product.product_id) } : {}),
      orders30d: product.lastest_volume ?? null,
      rating: parsePercent(product.evaluate_rate),
      resultCount,
      raw: quotes.has(product.product_id) ? { ...product, shipping: quotes.get(product.product_id) } : product,
    }));
  }
}
