import { NextResponse, type NextRequest } from "next/server";
import { PINTEREST_CALLBACK_PATH, PINTEREST_STATE_COOKIE, publicOrigin } from "@/lib/request-origin";
import { createDbTokenStore } from "@/lib/token-store";
import { PINTEREST_TOKEN_PROVIDER, requestPinterestToken } from "@/sources/demand/pinterest-trends";

export const dynamic = "force-dynamic";

/** Rückkehr von Pinterest: Code gegen Tokens tauschen und den Refresh-Token speichern. */
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const back = (status: string) => {
    const response = NextResponse.redirect(new URL(`/quellen?pinterest=${status}`, origin));
    response.cookies.delete({ name: PINTEREST_STATE_COOKIE, path: "/api/pinterest" });
    return response;
  };

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const expected = request.cookies.get(PINTEREST_STATE_COOKIE)?.value;
  if (!code) return back("abgebrochen");
  if (!state || !expected || state !== expected) return back("ungueltig");

  const appId = process.env.PINTEREST_APP_ID?.trim();
  const appSecret = process.env.PINTEREST_APP_SECRET?.trim();
  if (!appId || !appSecret) return back("fehlt");

  try {
    const token = await requestPinterestToken(appId, appSecret, {
      grant_type: "authorization_code",
      code,
      redirect_uri: origin + PINTEREST_CALLBACK_PATH,
    });
    if (!token.refreshToken) return back("ohne-refresh");
    await createDbTokenStore().save(PINTEREST_TOKEN_PROVIDER, token.refreshToken, token.refreshExpiresAt);
    return back("verbunden");
  } catch (error) {
    console.error("Pinterest-Verbindung fehlgeschlagen:", error instanceof Error ? error.message : error);
    return back("fehler");
  }
}
