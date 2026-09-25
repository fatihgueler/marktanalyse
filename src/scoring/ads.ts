import { radarConfig } from "@/config/radar.config";
import type { AdRecord } from "@/sources/types";

export interface AdMomentum {
  /** neue Anzeigen in den letzten `weeks` Wochen */
  recent: number;
  /** neue Anzeigen in den `weeks` Wochen davor */
  previous: number;
  /** relative Veränderung; null = vorher keine Anzeigen, jetzt schon („neu“) */
  growth: number | null;
  weeks: number;
}

export interface AdsBreakdown {
  /** mindestens eine Werbebibliothek deckt das Land ab */
  covered: boolean;
  /** höchste Zahl Werbetreibender über alle Quellen (Shops werben oft auf mehreren Plattformen) */
  advertisers: number | null;
  activeAds: number;
  capped: boolean;
  firstSeen: string | null;
  /** neue Anzeigen je Woche, über alle Quellen summiert */
  newAdsPerWeek: { weekStart: string; count: number }[];
  momentum: AdMomentum;
  sources: { source: string; coverage: boolean; advertisers: number; activeAds: number; capped: boolean }[];
  samples: { source: string; advertiser: string; startedAt: string; previewUrl: string | null }[];
}

/**
 * Marktdynamik der Werbung: neue Anzeigen der letzten Wochen ggü. den Wochen davor.
 * Wird bewusst NICHT gewichtet, bis Drop-Ergebnisse zeigen, ob sie Nachfrage oder Konkurrenz anzeigt.
 */
export function adMomentum(newAdsPerWeek: readonly { count: number }[], weeks: number = radarConfig.trend.recentWeeks): AdMomentum {
  const counts = newAdsPerWeek.map((w) => w.count);
  const recent = counts.slice(-weeks).reduce((a, b) => a + b, 0);
  const previous = counts.slice(-2 * weeks, -weeks).reduce((a, b) => a + b, 0);
  const growth = previous > 0 ? (recent - previous) / previous : recent > 0 ? null : 0;
  return { recent, previous, growth, weeks };
}

/**
 * Führt die Werbedaten mehrerer Bibliotheken für ein Keyword/Land zusammen.
 * ANNAHME: Werbetreibende werden nicht addiert, sondern das Maximum genommen – derselbe Shop
 * wirbt häufig auf Meta und TikTok gleichzeitig.
 */
export function combineAdSignals(records: readonly AdRecord[]): AdsBreakdown {
  const covered = records.filter((r) => r.coverage);
  const weekMap = new Map<string, number>();
  for (const record of covered) {
    for (const week of record.newAdsPerWeek) weekMap.set(week.weekStart, (weekMap.get(week.weekStart) ?? 0) + week.count);
  }
  const newAdsPerWeek = [...weekMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, count]) => ({ weekStart, count }));
  const firstSeenDates = covered.map((r) => r.firstSeen).filter((d): d is string => d !== null).sort();

  return {
    covered: covered.length > 0,
    advertisers: covered.length > 0 ? Math.max(...covered.map((r) => r.advertisers)) : null,
    activeAds: covered.reduce((sum, r) => sum + r.activeAds, 0),
    capped: covered.some((r) => r.capped),
    firstSeen: firstSeenDates[0] ?? null,
    newAdsPerWeek,
    momentum: adMomentum(newAdsPerWeek),
    sources: records.map((r) => ({ source: r.source, coverage: r.coverage, advertisers: r.advertisers, activeAds: r.activeAds, capped: r.capped })),
    samples: covered.flatMap((r) => r.samples.map((s) => ({ ...s, source: r.source }))).slice(0, radarConfig.ads.samplesPerKeyword),
  };
}
