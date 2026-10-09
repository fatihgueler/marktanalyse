import { describe, expect, it } from "vitest";
import type { KeywordProductClassifier, KeywordVerdict } from "./keyword-classifier";
import { PassThroughKeywordClassifier } from "./keyword-classifier";
import { gateKeywords } from "./keyword-gate";

function fakeClassifier(notProducts: Record<string, string>, fail = false): KeywordProductClassifier & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    mode: "live",
    calls,
    async classify(keywords) {
      calls.push(keywords);
      if (fail) throw new Error("HTTP 529");
      return new Map<string, KeywordVerdict>(keywords.map((k) => [k, k in notProducts ? { isProduct: false, reason: notProducts[k]! } : { isProduct: true, reason: "Produkt" }]));
    },
  };
}

const LIVE_RUN_SAMPLE = ["ikea fado lamp", "inspector gadget", "wolkenlampe", "herbst deko basteln", "saily", "mini thermodrucker", "hulled wheat"];

describe("gateKeywords", () => {
  it("filtert erst per Regel und schickt nur den Rest gebündelt an Claude", async () => {
    const classifier = fakeClassifier({ "inspector gadget": "Zeichentrickserie", saily: "eSIM-Anbieter", "hulled wheat": "Lebensmittel" });
    const result = await gateKeywords(LIVE_RUN_SAMPLE, "DE", classifier);
    expect(result.kept).toEqual(["wolkenlampe", "mini thermodrucker"]);
    expect(classifier.calls).toEqual([["inspector gadget", "wolkenlampe", "saily", "mini thermodrucker", "hulled wheat"]]);
    expect(result.rejected).toEqual([
      { keyword: "ikea fado lamp", by: "regel", reason: "Marke/Händler: ikea" },
      { keyword: "herbst deko basteln", by: "regel", reason: "Selbermachen/Ideen: basteln" },
      { keyword: "inspector gadget", by: "claude", reason: "Zeichentrickserie" },
      { keyword: "saily", by: "claude", reason: "eSIM-Anbieter" },
      { keyword: "hulled wheat", by: "claude", reason: "Lebensmittel" },
    ]);
    expect(result.claudeError).toBeNull();
  });

  it("ohne Claude wirkt nur der Regelfilter", async () => {
    const result = await gateKeywords(LIVE_RUN_SAMPLE, "DE", new PassThroughKeywordClassifier());
    expect(result.kept).toEqual(["inspector gadget", "wolkenlampe", "saily", "mini thermodrucker", "hulled wheat"]);
    expect(result.rejected).toHaveLength(2);
  });

  it("lässt bei einem Claude-Fehler alle regelkonformen Begriffe durch und meldet den Fehler", async () => {
    const result = await gateKeywords(LIVE_RUN_SAMPLE, "AT", fakeClassifier({}, true));
    expect(result.kept).toHaveLength(5);
    expect(result.claudeError).toBe("HTTP 529");
  });
});
