"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, constantTimeEqual, readAuthConfig, sessionTokenFor } from "@/lib/auth";

export interface LoginState {
  error: string | null;
}

/** Bremst Rateversuche, ohne ein Konto-/Sperrsystem einzuführen. */
const FAILED_LOGIN_DELAY_MS = 800;

/** Nur interne Pfade als Weiterleitungsziel – verhindert Open Redirects („//evil.com“). */
function safeTarget(target: FormDataEntryValue | null): string {
  if (typeof target !== "string" || !target.startsWith("/") || target.startsWith("//")) return "/";
  return target;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const config = readAuthConfig();
  if (!config.ok) return { error: `Dashboard nicht konfiguriert: ${config.problem}` };

  const password = String(formData.get("passwort") ?? "");
  const [given, expected] = await Promise.all([
    sessionTokenFor(password, config.secret),
    sessionTokenFor(config.password, config.secret),
  ]);
  if (!constantTimeEqual(given, expected)) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_LOGIN_DELAY_MS));
    return { error: "Passwort ist nicht korrekt." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  redirect(safeTarget(formData.get("von")));
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  redirect("/login");
}
