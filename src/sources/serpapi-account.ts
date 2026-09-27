import { z } from "zod";
import { fetchJson } from "./http";

const accountSchema = z.looseObject({
  plan_name: z.string().optional(),
  searches_per_month: z.number().optional(),
  total_searches_left: z.number().optional(),
  plan_searches_left: z.number().optional(),
});

/** SerpApi-Kontostand über die kostenlose Account-API (zählt nicht gegen das Kontingent). */
export async function fetchSerpApiAccount(apiKey: string): Promise<{ planName: string | null; perMonth: number | null; left: number | null }> {
  const account = accountSchema.parse(await fetchJson<unknown>(`https://serpapi.com/account.json?api_key=${encodeURIComponent(apiKey)}`));
  return {
    planName: account.plan_name ?? null,
    perMonth: account.searches_per_month ?? null,
    left: account.total_searches_left ?? account.plan_searches_left ?? null,
  };
}
