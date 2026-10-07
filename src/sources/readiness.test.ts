import { describe, expect, it } from "vitest";
import { mixedModeWarnings, unusableLiveRunReason } from "./readiness";
import type { RunSourceMode } from "./types";

const ALL_MOCK: Record<string, RunSourceMode> = {
  "google-trends": "mock",
  "tiktok-trends": "mock",
  aliexpress: "mock",
  "alibaba-1688": "mock",
  "google-shopping": "mock",
  "pinterest-trends": "mock",
  "meta-ad-library": "mock",
  "tiktok-ads": "mock",
  claude: "mock",
};

describe("mixedModeWarnings", () => {
  it("reiner Demo-Betrieb ist kein Mischbetrieb", () => {
    expect(mixedModeWarnings(ALL_MOCK)).toEqual([]);
  });

  it("Mindestausstattung SerpApi + AliExpress + Claude ist sauber – Werbedaten dürfen Demo bleiben", () => {
    const modes = { ...ALL_MOCK, "google-trends": "live", "google-shopping": "live", aliexpress: "live", claude: "live" } as const;
    expect(mixedModeWarnings(modes)).toEqual([]);
  });

  it("warnt bei echten Trends ohne echte Angebote", () => {
    const modes = { ...ALL_MOCK, "google-trends": "live", "google-shopping": "live", claude: "live" } as const;
    const warnings = mixedModeWarnings(modes);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/AliExpress/);
  });

  it("warnt bei echten Angeboten ohne Trends und Verkaufspreise", () => {
    const modes = { ...ALL_MOCK, aliexpress: "live", claude: "live" } as const;
    const warnings = mixedModeWarnings(modes);
    expect(warnings).toHaveLength(2);
    expect(warnings.join(" ")).toMatch(/Verkaufspreise/);
  });

  it("empfiehlt Claude, wenn sonst alles live ist", () => {
    const modes = { ...ALL_MOCK, "google-trends": "live", "google-shopping": "live", aliexpress: "live" } as const;
    expect(mixedModeWarnings(modes)).toEqual([expect.stringMatching(/ANTHROPIC_API_KEY/)]);
  });

  it("kostenlose Variante ohne SerpApi: Pinterest + AliExpress + Claude läuft, Preise nur geschätzt", () => {
    const modes = { ...ALL_MOCK, "pinterest-trends": "live", aliexpress: "live", claude: "live" } as const;
    expect(mixedModeWarnings(modes)).toEqual([expect.stringMatching(/Kategorie-Faktor/)]);
  });
});

describe("unusableLiveRunReason", () => {
  it("lässt Demo-Läufe und vollständige Echtläufe durch", () => {
    expect(unusableLiveRunReason(ALL_MOCK)).toBeNull();
    expect(unusableLiveRunReason({ ...ALL_MOCK, "google-trends": "live", aliexpress: "live" })).toBeNull();
    expect(unusableLiveRunReason({ ...ALL_MOCK, "google-trends": "live", "alibaba-1688": "live", claude: "live" })).toBeNull();
  });

  it("stoppt Trends + 1688 ohne Claude, weil 1688 ohne Übersetzung nichts findet", () => {
    const modes = { ...ALL_MOCK, "google-trends": "live", "tiktok-trends": "live", "google-shopping": "live", "alibaba-1688": "live", aliexpress: "off" } as const;
    expect(unusableLiveRunReason(modes)).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("stoppt Trends ohne jede Angebotsquelle und Angebote ohne Trends", () => {
    expect(unusableLiveRunReason({ ...ALL_MOCK, "google-trends": "live" })).toMatch(/AliExpress/);
    expect(unusableLiveRunReason({ ...ALL_MOCK, aliexpress: "live" })).toMatch(/Trendquelle/);
  });
});
