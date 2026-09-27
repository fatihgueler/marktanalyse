import { describe, expect, it } from "vitest";
import { mixedModeWarnings } from "./readiness";
import type { SourceMode } from "./types";

const ALL_MOCK: Record<string, SourceMode> = {
  "google-trends": "mock",
  "tiktok-trends": "mock",
  aliexpress: "mock",
  "alibaba-1688": "mock",
  "google-shopping": "mock",
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

  it("warnt bei echten Angeboten ohne Trends und Referenzpreise", () => {
    const modes = { ...ALL_MOCK, aliexpress: "live", claude: "live" } as const;
    const warnings = mixedModeWarnings(modes);
    expect(warnings).toHaveLength(2);
    expect(warnings.join(" ")).toMatch(/Referenzpreise/);
  });

  it("empfiehlt Claude, wenn sonst alles live ist", () => {
    const modes = { ...ALL_MOCK, "google-trends": "live", "google-shopping": "live", aliexpress: "live" } as const;
    expect(mixedModeWarnings(modes)).toEqual([expect.stringMatching(/ANTHROPIC_API_KEY/)]);
  });
});
