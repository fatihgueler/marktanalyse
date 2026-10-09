import { COUNTRIES, type Country } from "@/config/radar.config";

/**
 * Optionen für einen kleineren Probelauf von `collect`:
 *   --max-searches=100   SerpApi-Budget dieses Laufs (senkt das Budget laut Config, erhöht es nie)
 *   --countries=DE,AT    nur diese Länder (Trends, Angebote, Werbedaten, Scraping)
 */
export interface RunOptions {
  maxSearches: number | null;
  countries: Country[] | null;
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export function parseRunOptions(argv: readonly string[]): RunOptions {
  const rawMax = argValue(argv, "max-searches");
  let maxSearches: number | null = null;
  if (rawMax !== undefined) {
    const parsed = Number(rawMax);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`--max-searches braucht eine ganze Zahl über 0, bekommen: „${rawMax}“`);
    }
    maxSearches = parsed;
  }

  const rawCountries = argValue(argv, "countries");
  let countries: Country[] | null = null;
  if (rawCountries !== undefined) {
    const wanted = rawCountries
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const unknown = wanted.filter((c) => !(COUNTRIES as readonly string[]).includes(c));
    if (unknown.length > 0 || wanted.length === 0) {
      throw new Error(`--countries kennt nur ${COUNTRIES.join(", ")}, bekommen: „${rawCountries}“`);
    }
    countries = COUNTRIES.filter((c) => wanted.includes(c));
  }

  return { maxSearches, countries };
}
