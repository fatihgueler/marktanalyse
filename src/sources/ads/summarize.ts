import { radarConfig, type Country } from "@/config/radar.config";
import { addWeeks, isoDate, mondayOf } from "@/lib/weeks";
import type { AdRecord } from "../types";

/** Eine Anzeige in normalisierter Form, egal aus welcher Werbebibliothek. */
export interface RawAd {
  advertiserId: string;
  advertiserName: string;
  /** Start der Auslieferung bzw. erste Anzeige */
  startedAt: Date;
  previewUrl: string | null;
}

interface SummaryInput {
  source: string;
  keyword: string;
  country: Country;
  ads: RawAd[];
  /** Obergrenze erreicht (es gäbe weitere Seiten) */
  capped: boolean;
  raw: unknown;
  now?: Date;
}

/**
 * Verdichtet eine Liste Anzeigen zu Kennzahlen: Anzahl, Werbetreibende, neue Anzeigen je Woche
 * (für die Marktdynamik), erste Anzeige und die neuesten Beispiele.
 */
export function summarizeAds({ source, keyword, country, ads, capped, raw, now = new Date() }: SummaryInput): AdRecord {
  const { momentumWeeks, samplesPerKeyword } = radarConfig.ads;
  const currentWeek = mondayOf(now);
  const firstWeek = addWeeks(currentWeek, -momentumWeeks);
  const newAdsPerWeek = Array.from({ length: momentumWeeks }, (_, i) => ({ weekStart: isoDate(addWeeks(firstWeek, i)), count: 0 }));
  for (const ad of ads) {
    const index = Math.floor((mondayOf(ad.startedAt).getTime() - firstWeek.getTime()) / (7 * 86_400_000));
    const bucket = newAdsPerWeek[index];
    if (bucket) bucket.count++;
  }

  const sorted = [...ads].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const oldest = sorted[0];
  return {
    source,
    country,
    keyword,
    fetchedAt: now,
    coverage: true,
    activeAds: ads.length,
    advertisers: new Set(ads.map((ad) => ad.advertiserId)).size,
    capped,
    newAdsPerWeek,
    firstSeen: oldest ? isoDate(oldest.startedAt) : null,
    samples: sorted
      .slice(-samplesPerKeyword)
      .reverse()
      .map((ad) => ({ advertiser: ad.advertiserName, startedAt: isoDate(ad.startedAt), previewUrl: ad.previewUrl })),
    raw,
  };
}

/** Datensatz für Länder, die eine Werbebibliothek nicht abdeckt (z. B. Meta in GB/CH). */
export function notCovered(source: string, keyword: string, country: Country): AdRecord {
  return {
    source,
    country,
    keyword,
    fetchedAt: new Date(),
    coverage: false,
    activeAds: 0,
    advertisers: 0,
    capped: false,
    newAdsPerWeek: [],
    firstSeen: null,
    samples: [],
    raw: { coverage: false, reason: "Land nicht von der Werbebibliothek abgedeckt (nur EU)" },
  };
}

export function isCovered(country: Country): boolean {
  return radarConfig.ads.coveredCountries.includes(country);
}
