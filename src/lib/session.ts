import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSession } from "./auth";

/** Zusätzlich zur Middleware: Server Actions sind eigene Endpunkte und prüfen die Sitzung selbst. */
export async function assertSession(): Promise<void> {
  const cookieStore = await cookies();
  if (!(await isValidSession(cookieStore.get(SESSION_COOKIE)?.value))) throw new Error("Nicht angemeldet.");
}
