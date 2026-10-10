import { afterEach, describe, expect, it, vi } from "vitest";
import { radarConfig } from "@/config/radar.config";
import { SearchBudget } from "../budget";
import { GoogleTrendsSerpApiSource } from "./google-trends.serpapi";

/** Antworten wie im Test vom 10.10.2026 (gekürzt) */
function fakeSerpApi() {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      const body =
        url.searchParams.get("engine") === "google_trends_trending_now"
          ? { trending_searches: [{ query: "Happy Ears Ohrstöpsel", increase_percentage: 1000 }] }
          : url.searchParams.has("q")
            ? { related_queries: { rising: [{ query: `${url.searchParams.get("q")} xl`, value: "+300 %" }] } }
            : { related_queries: { rising: [{ query: "Sonnenfinsternis Brille", value: "+ 3.250 %" }] } };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("GoogleTrendsSerpApiSource.discoverKeywords", () => {
  it("fragt Seeds, Kategorien ohne Startbegriff und Trending Now ab", async () => {
    const calls = fakeSerpApi();
    const budget = new SearchBudget("test", 100);
    const found = await new GoogleTrendsSerpApiSource("key", budget).discoverKeywords(["nachtlicht"], "DE", new Date("2026-10-12"));

    const { maxCategoriesPerCountry } = radarConfig.demand;
    expect(budget.consumed).toBe(1 + maxCategoriesPerCountry + 1);
    const categoryCalls = calls.filter((u) => u.searchParams.has("cat"));
    expect(categoryCalls).toHaveLength(maxCategoriesPerCountry);
    for (const call of categoryCalls) expect(call.searchParams.has("q")).toBe(false);
    expect(calls.at(-1)?.searchParams.get("category_id")).toBe("16");

    expect(found.map((f) => f.keyword)).toEqual(["nachtlicht xl", "sonnenfinsternis brille", "happy ears ohrstöpsel"]);
    expect(found[1]?.seedTerm).toMatch(/^Kategorie /);
    expect(found[2]?.seedTerm).toBe("Google Trending Now (Shopping)");
  });

  it("hört auf, wenn das Budget erschöpft ist", async () => {
    fakeSerpApi();
    const budget = new SearchBudget("test", 2);
    const found = await new GoogleTrendsSerpApiSource("key", budget).discoverKeywords(["nachtlicht"], "DE", new Date("2026-10-12"));
    expect(budget.consumed).toBe(2);
    expect(found.length).toBeGreaterThan(0);
  });
});
