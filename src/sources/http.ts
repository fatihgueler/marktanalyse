import { radarConfig } from "@/config/radar.config";

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1_000;

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly body: string | null,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Hält einen Mindestabstand zwischen Requests einer Quelle ein – auch wenn
 * mehrere Aufrufe parallel laufen (jeder reserviert sich den nächsten freien Slot).
 */
export class Throttle {
  private nextSlot = 0;

  constructor(private readonly minIntervalMs: number = radarConfig.collect.requestDelayMs) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.minIntervalMs;
    if (slot > now) await sleep(slot - now);
  }
}

/**
 * GET/POST mit Timeout, Retry bei 429/5xx/Netzwerkfehlern und exponentiellem Backoff.
 * Die URL wird in Fehlermeldungen ohne Query-String ausgegeben, damit keine Keys in Logs landen.
 */
export interface FetchOptions {
  /** Timeout je Versuch; Standard aus der Config */
  timeoutMs?: number;
  /** 1 = keine Wiederholung – für kostenpflichtige, nicht idempotente Aufrufe (z. B. Scraping-Läufe) */
  maxAttempts?: number;
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, throttle?: Throttle, options: FetchOptions = {}): Promise<T> {
  const safeUrl = url.split("?")[0] ?? url;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? radarConfig.collect.requestTimeoutMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await throttle?.wait();
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return (await response.json()) as T;

      const body = await response.text().catch(() => null);
      const error = new HttpError(`HTTP ${response.status} bei ${safeUrl}`, response.status, body?.slice(0, 500) ?? null);
      if (!RETRYABLE_STATUS.has(response.status)) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof HttpError && error.status !== null && !RETRYABLE_STATUS.has(error.status)) throw error;
      lastError = error;
    }
    if (attempt < maxAttempts) await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new HttpError(`Anfrage an ${safeUrl} nach ${maxAttempts} Versuch(en) fehlgeschlagen: ${reason}`, null, null);
}
