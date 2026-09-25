import { describe, expect, it } from "vitest";
import { notCovered, summarizeAds, type RawAd } from "@/sources/ads/summarize";
import { addWeeks } from "@/lib/weeks";
import { adMomentum, combineAdSignals } from "./ads";

const now = new Date("2026-09-25T12:00:00Z"); // Freitag

function ad(advertiserId: string, weeksAgo: number): RawAd {
  return { advertiserId, advertiserName: `Shop ${advertiserId}`, startedAt: addWeeks(now, -weeksAgo), previewUrl: null };
}

describe("summarizeAds", () => {
  it("zählt Anzeigen, Werbetreibende und neue Anzeigen je Woche", () => {
    const record = summarizeAds({
      source: "test",
      keyword: "wolkenlampe",
      country: "DE",
      ads: [ad("a", 0), ad("a", 1), ad("b", 1), ad("c", 30)],
      capped: false,
      raw: null,
      now,
    });
    expect(record.activeAds).toBe(4);
    expect(record.advertisers).toBe(3);
    expect(record.newAdsPerWeek).toHaveLength(8);
    // aktuelle Woche liegt nicht im Fenster (unvollständig) – letzte volle Woche enthält die 2 Anzeigen von vor 1 Woche
    expect(record.newAdsPerWeek.at(-1)?.count).toBe(2);
    expect(record.newAdsPerWeek.reduce((s, w) => s + w.count, 0)).toBe(2);
    expect(record.firstSeen).toBe("2026-02-27");
    expect(record.samples[0]?.advertiser).toBe("Shop a");
  });

  it("liefert für nicht abgedeckte Länder einen leeren Datensatz", () => {
    const record = notCovered("meta-ad-library", "cloud lamp", "GB");
    expect(record.coverage).toBe(false);
    expect(record.advertisers).toBe(0);
  });
});

describe("adMomentum", () => {
  it("vergleicht die letzten 4 Wochen mit den 4 davor", () => {
    const weeks = [1, 1, 1, 1, 2, 3, 3, 4].map((count) => ({ count }));
    const momentum = adMomentum(weeks, 4);
    expect(momentum.previous).toBe(4);
    expect(momentum.recent).toBe(12);
    expect(momentum.growth).toBeCloseTo(2);
  });

  it("kennzeichnet ganz neue Werbung ohne Vorperiode mit null", () => {
    expect(adMomentum([0, 0, 0, 0, 0, 1, 2, 3].map((count) => ({ count })), 4).growth).toBeNull();
  });

  it("gibt 0 zurück, wenn es keine neuen Anzeigen gibt", () => {
    expect(adMomentum([], 4).growth).toBe(0);
  });
});

describe("combineAdSignals", () => {
  const meta = summarizeAds({ source: "meta", keyword: "k", country: "DE", ads: [ad("a", 1), ad("b", 2), ad("c", 3)], capped: false, raw: null, now });
  const tiktok = summarizeAds({ source: "tiktok", keyword: "k", country: "DE", ads: [ad("x", 1)], capped: true, raw: null, now });

  it("nimmt das Maximum der Werbetreibenden und summiert neue Anzeigen", () => {
    const combined = combineAdSignals([meta, tiktok]);
    expect(combined.covered).toBe(true);
    expect(combined.advertisers).toBe(3);
    expect(combined.activeAds).toBe(4);
    expect(combined.capped).toBe(true);
    expect(combined.newAdsPerWeek.reduce((s, w) => s + w.count, 0)).toBe(4);
  });

  it("liefert advertisers = null, wenn kein Land abgedeckt ist", () => {
    const combined = combineAdSignals([notCovered("meta", "k", "GB"), notCovered("tiktok", "k", "GB")]);
    expect(combined.covered).toBe(false);
    expect(combined.advertisers).toBeNull();
  });
});
