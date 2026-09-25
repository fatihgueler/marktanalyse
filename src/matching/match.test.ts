import { describe, expect, it, vi } from "vitest";
import { matchProducts, type JudgmentCache } from "./match";
import type { Judgment, MatchJudge } from "./types";

const input = {
  keyword: "wolkenlampe",
  country: "DE" as const,
  products: [
    { externalId: "a", title: "Cloud Lamp LED", price: 9, currency: "EUR" },
    { externalId: "b", title: "Cloud Shaped Pillow", price: 5, currency: "EUR" },
  ],
};

function memoryCache(initial: Judgment[] = []): JudgmentCache & { saved: Judgment[] } {
  const saved: Judgment[] = [];
  return {
    saved,
    load: vi.fn(async () => new Map(initial.map((j) => [j.externalId, j]))),
    save: vi.fn(async (_k, _j, judgments) => {
      saved.push(...judgments);
    }),
  };
}

const liveJudge = (impl: MatchJudge["judge"]): MatchJudge => ({ id: "claude:test", mode: "live", judge: vi.fn(impl) });

describe("matchProducts", () => {
  it("fragt nur ungecachte Paare beim Live-Judge an und speichert sie", async () => {
    const cache = memoryCache([{ externalId: "a", relevance: 0.9, category: "beleuchtung", reason: "gecacht" }]);
    const judge = liveJudge(async ({ products }) => products.map((p) => ({ externalId: p.externalId, relevance: 0.1, category: "wohnen-deko", reason: "neu" })));
    const result = await matchProducts(input, judge, cache);
    expect(judge.judge).toHaveBeenCalledWith(expect.objectContaining({ products: [input.products[1]] }));
    expect(result.judgments.get("a")?.reason).toBe("gecacht");
    expect(cache.saved.map((j) => j.externalId)).toEqual(["b"]);
  });

  it("springt bei Fehlern mit der Heuristik ein und cacht deren Ergebnis nicht", async () => {
    const cache = memoryCache();
    const judge = liveJudge(async () => {
      throw new Error("429 rate limit");
    });
    const result = await matchProducts(input, judge, cache);
    expect(result.error).toMatch(/429/);
    expect(result.judgments.get("a")?.judge).toBe("heuristic");
    expect(result.judgments.get("a")?.relevance).toBe(1);
    expect(cache.saved).toHaveLength(0);
  });

  it("nutzt keinen Cache für die Heuristik (Mock-Modus)", async () => {
    const cache = memoryCache();
    const judge: MatchJudge = { id: "heuristic", mode: "mock", judge: async ({ products }) => products.map((p) => ({ externalId: p.externalId, relevance: 1, category: "beleuchtung", reason: "h" })) };
    await matchProducts(input, judge, cache);
    expect(cache.load).not.toHaveBeenCalled();
    expect(cache.save).not.toHaveBeenCalled();
  });
});
