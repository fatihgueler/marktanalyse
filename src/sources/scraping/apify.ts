import { radarConfig } from "@/config/radar.config";
import { HttpError, fetchJson, type Throttle } from "../http";

const APIFY_BASE = "https://api.apify.com/v2/acts";
/** Puffer über dem Apify-Timeout, damit Apify den Lauf sauber beendet, bevor wir abbrechen */
const CLIENT_TIMEOUT_BUFFER_MS = 15_000;

/**
 * Startet einen Apify-Actor synchron und liefert die Dataset-Einträge.
 * Kostenschutz: `maxTotalChargeUsd` begrenzt die Kosten je Lauf hart; es gibt keine automatische
 * Wiederholung, weil jeder Versuch erneut kostet.
 */
export async function runApifyActor<T = unknown>(
  token: string,
  actorId: string,
  input: Record<string, unknown>,
  options: { maxItems: number; maxChargeUsd: number; throttle?: Throttle },
): Promise<T[]> {
  const timeoutSeconds = radarConfig.scraping.runTimeoutSeconds;
  const params = new URLSearchParams({
    timeout: String(timeoutSeconds),
    maxItems: String(options.maxItems),
    maxTotalChargeUsd: String(options.maxChargeUsd),
    format: "json",
    clean: "true",
  });
  try {
    const items = await fetchJson<unknown>(
      `${APIFY_BASE}/${actorId}/run-sync-get-dataset-items?${params.toString()}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      options.throttle,
      { timeoutMs: timeoutSeconds * 1000 + CLIENT_TIMEOUT_BUFFER_MS, maxAttempts: 1 },
    );
    if (!Array.isArray(items)) throw new Error("Apify: unerwartete Antwort (kein Array)");
    return items as T[];
  } catch (error) {
    if (error instanceof HttpError && error.status === 408) {
      throw new Error(`Apify-Actor ${actorId} hat länger als ${timeoutSeconds} s gebraucht und wurde abgebrochen.`);
    }
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      throw new Error(`Apify: Zugriff verweigert (${error.status}) – APIFY_TOKEN prüfen bzw. Actor abonnieren.`);
    }
    throw error;
  }
}
