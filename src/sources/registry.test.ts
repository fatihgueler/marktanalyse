import { describe, expect, it } from "vitest";
import { readCollectEnv } from "@/lib/env";
import { createSources, describeModes } from "./registry";

const env = (keys: Record<string, string>) => readCollectEnv({ DATABASE_URL: "postgresql://test", ...keys } as unknown as NodeJS.ProcessEnv);

describe("createSources", () => {
  it("läuft ohne Keys komplett im Demo-Modus", () => {
    const sources = createSources(env({}));
    expect(sources.disabled).toEqual([]);
    expect(sources.trend.every((s) => s.mode === "mock")).toBe(true);
    expect(sources.market?.mode).toBe("mock");
  });

  it("schaltet im Echtbetrieb alle Demo-Quellen ab, damit keine erfundenen Daten in die Rangliste geraten", () => {
    const sources = createSources(
      env({ SERPAPI_API_KEY: "k", ALIEXPRESS_APP_KEY: "a", ALIEXPRESS_APP_SECRET: "s", ALIEXPRESS_TRACKING_ID: "t" }),
    );
    expect(sources.trend.map((s) => s.id)).toEqual(["google-trends"]);
    expect(sources.supply.map((s) => s.id)).toEqual(["aliexpress"]);
    expect(sources.price?.mode).toBe("live");
    expect(sources.market).toBeNull();
    expect(sources.ads).toEqual([]);
    expect(sources.disabled).toEqual(expect.arrayContaining(["tiktok-trends", "pinterest-trends", "alibaba-1688", "ebay", "meta-ad-library", "tiktok-ads"]));

    const modes = describeModes(sources, "live");
    expect(modes).toMatchObject({ "google-trends": "live", ebay: "off", "meta-ad-library": "off", claude: "live" });
  });

  it("nimmt Pinterest und eBay live, sobald ihre Zugangsdaten gesetzt sind", () => {
    const sources = createSources(env({ PINTEREST_ACCESS_TOKEN: "p", EBAY_CLIENT_ID: "e", EBAY_CLIENT_SECRET: "s" }));
    expect(sources.trend.map((s) => s.id)).toEqual(["pinterest-trends"]);
    expect(sources.market?.mode).toBe("live");
    expect(sources.pinterestAuth).not.toBeNull();
  });
});
