import { NextResponse, type NextRequest } from "next/server";
import { PINTEREST_CALLBACK_PATH, PINTEREST_STATE_COOKIE, publicOrigin } from "@/lib/request-origin";
import { pinterestAuthorizeUrl } from "@/sources/demand/pinterest-trends";

export const dynamic = "force-dynamic";

const STATE_MAX_AGE_SECONDS = 600;

/** „Mit Pinterest verbinden“: leitet zur Pinterest-Anmeldung weiter (Middleware verlangt die Dashboard-Sitzung). */
export async function GET(request: NextRequest) {
  const appId = process.env.PINTEREST_APP_ID?.trim();
  if (!appId || !process.env.PINTEREST_APP_SECRET?.trim()) {
    return NextResponse.redirect(new URL("/quellen?pinterest=fehlt", publicOrigin(request)));
  }
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(pinterestAuthorizeUrl(appId, publicOrigin(request) + PINTEREST_CALLBACK_PATH, state));
  response.cookies.set(PINTEREST_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:",
    maxAge: STATE_MAX_AGE_SECONDS,
    path: "/api/pinterest",
  });
  return response;
}
