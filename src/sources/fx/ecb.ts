import { radarConfig, type RadarConfig } from "@/config/radar.config";
import { fetchText } from "../http";

/** Mit welchen Kursen ein Lauf rechnet – wird im Breakdown jedes Kandidaten gespeichert. */
export interface FxInfo {
  source: "ezb" | "config";
  /** Kursdatum der EZB (YYYY-MM-DD); null bei festen Kursen */
  date: string | null;
  /** Einheiten je 1 EUR */
  rates: Record<string, number>;
}

/**
 * Liest den Tageskurs-Feed der EZB (eurofxref-daily.xml). Bewusst per regulärem Ausdruck statt
 * XML-Bibliothek: Das Format ist seit Jahren unverändert und besteht nur aus `Cube`-Elementen.
 */
export function parseEcbXml(xml: string): { date: string; rates: Record<string, number> } {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  if (!date) throw new Error("EZB: Kursdatum fehlt – Format hat sich geändert");
  const rates: Record<string, number> = { EUR: 1 };
  for (const match of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) {
    const rate = Number(match[2]);
    if (match[1] && rate > 0) rates[match[1]] = rate;
  }
  return { date, rates };
}

function daysBetween(isoDate: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(`${isoDate}T00:00:00Z`).getTime()) / 86_400_000);
}

/**
 * Kurse für einen Lauf: EZB-Tageskurse für alle Währungen aus der Config, sonst die festen Werte.
 * Liefert zusätzlich eine Warnung, wenn auf feste oder veraltete Kurse zurückgegriffen wurde.
 */
export async function loadFxRates(
  config: RadarConfig = radarConfig,
  now: Date = new Date(),
  load: (url: string) => Promise<string> = (url) => fetchText(url),
): Promise<{ fx: FxInfo; warning: string | null }> {
  const fallback: FxInfo = { source: "config", date: null, rates: { ...config.fx } };
  if (config.fxUpdate.source === "config") return { fx: fallback, warning: null };

  try {
    const { date, rates } = parseEcbXml(await load(config.fxUpdate.url));
    const missing = Object.keys(config.fx).filter((currency) => !(rates[currency]! > 0));
    if (missing.length > 0) throw new Error(`EZB liefert keinen Kurs für ${missing.join(", ")}`);
    const merged = Object.fromEntries(Object.keys(config.fx).map((currency) => [currency, rates[currency]!]));
    const age = daysBetween(date, now);
    const warning = age > config.fxUpdate.maxAgeDays ? `EZB-Kurse sind ${age} Tage alt (Stand ${date}).` : null;
    return { fx: { source: "ezb", date, rates: merged }, warning };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { fx: fallback, warning: `EZB-Kurse nicht verfügbar (${reason}) – es gelten die festen Kurse aus der Config.` };
  }
}

/** Config-Kopie mit den Kursen des Laufs – alle Margenrechnungen eines Laufs nutzen dieselben Kurse. */
export function withFx(config: RadarConfig, fx: FxInfo): RadarConfig {
  return { ...config, fx: { ...config.fx, ...fx.rates } };
}
