/**
 * Einfacher Passwortschutz (kein Nutzerkonzept): Nach korrektem Passwort wird ein Cookie mit
 * HMAC(SESSION_SECRET, Passwort) gesetzt. Ändert sich Passwort oder Secret, sind alle Sitzungen ungültig.
 * Web Crypto statt node:crypto, damit es auch in der Edge-Middleware läuft.
 */
export const SESSION_COOKIE = "trend_radar_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MIN_SECRET_LENGTH = 32;

async function hmacHex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Vergleich in konstanter Zeit – verhindert Timing-Angriffe auf das Token. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type AuthConfig = { ok: true; password: string; secret: string } | { ok: false; problem: string };

export function readAuthConfig(): AuthConfig {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  const secret = process.env.SESSION_SECRET?.trim();
  if (!password) return { ok: false, problem: "DASHBOARD_PASSWORD ist nicht gesetzt." };
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    return { ok: false, problem: `SESSION_SECRET fehlt oder ist kürzer als ${MIN_SECRET_LENGTH} Zeichen.` };
  }
  return { ok: true, password, secret };
}

export async function sessionTokenFor(password: string, secret: string): Promise<string> {
  return hmacHex(secret, `session:${password}`);
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  const config = readAuthConfig();
  if (!config.ok || !token) return false;
  return constantTimeEqual(token, await sessionTokenFor(config.password, config.secret));
}
