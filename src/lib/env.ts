import { z } from "zod";

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL fehlt"),
  SERPAPI_API_KEY: optionalSecret,
  ALIEXPRESS_APP_KEY: optionalSecret,
  ALIEXPRESS_APP_SECRET: optionalSecret,
  ALIEXPRESS_TRACKING_ID: optionalSecret,
  ANTHROPIC_API_KEY: optionalSecret,
  ANTHROPIC_MODEL: optionalSecret.transform((value) => value ?? "claude-opus-5"),
  META_ACCESS_TOKEN: optionalSecret,
  META_APP_ID: optionalSecret,
  META_APP_SECRET: optionalSecret,
  TIKTOK_CLIENT_KEY: optionalSecret,
  TIKTOK_CLIENT_SECRET: optionalSecret,
});

export type CollectEnv = z.infer<typeof envSchema>;

/** ENV für den Collect-Job. Fehlende API-Keys sind erlaubt (→ Mock-Modus). */
export function readCollectEnv(source: NodeJS.ProcessEnv = process.env): CollectEnv {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Ungültige Umgebungsvariablen:\n${messages.join("\n")}`);
  }
  return parsed.data;
}
