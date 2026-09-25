import { z } from "zod";
import { radarConfig, type Country } from "@/config/radar.config";
import { Throttle, fetchJson } from "../http";
import type { SupplyRecord, SupplySource } from "../types";
import { signAliExpressParams } from "./aliexpress.sign";

const GATEWAY_URL = "https://api-sg.aliexpress.com/sync";
const METHOD = "aliexpress.affiliate.product.query";
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
});

const responseSchema = z.object({
  error_response: z.object({ code: z.union([z.string(), z.number()]), msg: z.string().optional() }).optional(),
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

  constructor(private readonly credentials: AliExpressCredentials) {}

  async search(keyword: string, shipTo: Country, limit: number): Promise<SupplyRecord[]> {
    const profile = radarConfig.countries[shipTo];
    const params: Record<string, string> = {
      method: METHOD,
      app_key: this.credentials.appKey,
      sign_method: "sha256",
      timestamp: String(Date.now()),
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
    params.sign = signAliExpressParams(params, this.credentials.appSecret);

    const json = await fetchJson<unknown>(
      GATEWAY_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: new URLSearchParams(params).toString(),
      },
      this.throttle,
    );
    const parsed = responseSchema.parse(json);
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

    return products.slice(0, limit).map((product) => ({
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
      // Die Affiliate-API liefert keine verlässlichen Versandkosten → Config-Annahme greift.
      shippingCost: null,
      orders30d: product.lastest_volume ?? null,
      rating: parsePercent(product.evaluate_rate),
      resultCount,
      raw: product,
    }));
  }
}
