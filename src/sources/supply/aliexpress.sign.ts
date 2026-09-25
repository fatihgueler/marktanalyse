import { createHmac } from "node:crypto";

/**
 * Signatur der AliExpress Open Platform (Gateway api-sg.aliexpress.com/sync, sign_method=sha256):
 * alle Parameter außer `sign` nach Schlüssel sortieren, als key1value1key2value2… verketten,
 * HMAC-SHA256 mit dem App-Secret, Hex in Großbuchstaben.
 * ANNAHME: Für Business-APIs über /sync wird – anders als bei REST-Pfaden (/rest/…) – kein
 * API-Pfad vorangestellt (laut Open-Platform-Doku „System Interfaces / Business Interfaces“).
 */
export function signAliExpressParams(params: Record<string, string>, appSecret: string): string {
  const canonical = Object.keys(params)
    .filter((key) => key !== "sign")
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  return createHmac("sha256", appSecret).update(canonical, "utf8").digest("hex").toUpperCase();
}
