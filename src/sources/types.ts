/**
 * Einheitliche Adapter-Interfaces.
 *
 * Neue Quellen (Phase 2: 1688, TikTok Creative Center, Meta Ad Library) implementieren
 * eines dieser Interfaces und werden in `registry.ts` eingetragen – der Collect-Job
 * kennt nur die Interfaces, nie eine konkrete Quelle.
 */
import type { Country } from "@/config/radar.config";

export type { Country };
export type SourceMode = "live" | "mock";

/** Gemeinsame Hülle jedes normalisierten Datensatzes. */
export interface SourceRecord<TRaw = unknown> {
  source: string;
  country: Country;
  fetchedAt: Date;
  /** unveränderte API-Antwort bzw. Mock-Rohdaten – für Nachvollziehbarkeit */
  raw: TRaw;
}

interface SourceBase {
  /** stabil, wird in der DB gespeichert */
  readonly id: string;
  /** deutsch, fürs Dashboard */
  readonly label: string;
  /** "mock", sobald der Key fehlt – automatisch */
  readonly mode: SourceMode;
}

// ── Nachfrage ───────────────────────────────────────────────────────────

export interface TrendPoint {
  /** Montag der Woche, YYYY-MM-DD */
  weekStart: string;
  /** relatives Suchinteresse 0..100 (100 = Maximum im Abfragezeitraum) */
  value: number;
}

export interface DiscoveredKeyword {
  keyword: string;
  seedTerm: string;
  /** Rohwert der Quelle, z. B. "+250 %" oder "Breakout" */
  signal: string;
}

export interface DemandRecord extends SourceRecord {
  keyword: string;
  seedTerm: string | null;
  /** wöchentlich, älteste zuerst */
  series: TrendPoint[];
}

export interface TrendSource extends SourceBase {
  /** Neue, steigende Keywords rund um die Seeds finden. */
  discoverKeywords(seeds: string[], country: Country): Promise<DiscoveredKeyword[]>;
  /** Zeitreihe für ein Keyword laden (einzeln, damit die 0..100-Normierung nur vom Keyword selbst abhängt). */
  fetchSeries(keyword: string, seedTerm: string | null, country: Country): Promise<DemandRecord | null>;
}

// ── Angebot ─────────────────────────────────────────────────────────────

export interface SupplyRecord extends SourceRecord {
  externalId: string;
  keyword: string;
  title: string;
  url: string;
  imageUrl: string | null;
  /** Stückpreis beim Lieferanten */
  price: number;
  currency: string;
  /** null → Versand-Annahme aus der Config */
  shippingCost: number | null;
  orders30d: number | null;
  /** positive Bewertungen in Prozent (0..100) */
  rating: number | null;
  /** Gesamttreffer der Suche – Anbieter-Proxy */
  resultCount: number | null;
}

export interface SupplySource extends SourceBase {
  search(keyword: string, shipTo: Country, limit: number): Promise<SupplyRecord[]>;
}

// ── Referenzpreis ───────────────────────────────────────────────────────

export interface PriceRecord extends SourceRecord {
  keyword: string;
  /** Median-Endkundenpreis, brutto, Landeswährung */
  medianPrice: number;
  currency: string;
  sampleSize: number;
}

export interface PriceSource extends SourceBase {
  /** null, wenn zu wenige Treffer – dann greift der Multiplikator-Fallback */
  referencePrice(keyword: string, country: Country): Promise<PriceRecord | null>;
}
