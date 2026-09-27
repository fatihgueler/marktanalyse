import type { NextRequest } from "next/server";

/**
 * Öffentliche Adresse, unter der das Dashboard aufgerufen wurde. Hinter dem Railway-Proxy steht sie
 * in X-Forwarded-Host/-Proto; `request.url` kann dort eine interne Adresse sein.
 */
export function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}

export const PINTEREST_CALLBACK_PATH = "/api/pinterest/callback";
/** Schutz gegen untergeschobene Rückleitungen: zufälliger Wert, der im Cookie und bei Pinterest landet. */
export const PINTEREST_STATE_COOKIE = "pinterest_oauth_state";
