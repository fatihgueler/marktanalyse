import { describe, expect, it } from "vitest";
import { radarConfig } from "@/config/radar.config";
import { MOCK_CATALOG } from "@/sources/mock/catalog";
import { HeuristicJudge } from "./heuristic-judge";

const judge = new HeuristicJudge(radarConfig);
const { minRelevance } = radarConfig.matching;

describe("HeuristicJudge", () => {
  it("zerlegt zusammengesetzte Wörter und übersetzt Bestandteile", () => {
    const result = judge.judgeOne("wolkenlampe", "1", "Cloud Lamp LED Fluffy Cotton Ceiling Light");
    expect(result.relevance).toBe(1);
    expect(result.category).toBe("beleuchtung");
  });

  it("wertet Titel ab, die nur einen Bestandteil teilen", () => {
    expect(judge.judgeOne("wolkenlampe", "1", "Cloud Shaped Pillow Soft Cushion").relevance).toBeLessThan(minRelevance);
  });

  it("wertet Zubehör ab", () => {
    const result = judge.judgeOne("kerzenwärmer lampe", "1", "Candle Warmer Lamp Replacement Bulb");
    expect(result.relevance).toBeLessThan(minRelevance);
    expect(result.reason).toMatch(/Zubehör/);
  });

  it("leitet die Kategorie zuerst aus dem Keyword ab", () => {
    expect(judge.judgeOne("mini thermodrucker", "1", "Pocket Photo Printer Inkless Labels").category).toBe("technik-gadgets");
    expect(judge.judgeOne("pixel art display", "1", "Pixel Art Frame 256 LEDs WiFi").category).toBe("technik-gadgets");
  });

  it("fällt ohne Kategorie-Treffer auf „sonstiges“ zurück", () => {
    expect(judge.judgeOne("xyz", "1", "Qwerty Thing").category).toBe("sonstiges");
  });

  describe.each(MOCK_CATALOG.flatMap((p) => [[p.keyword.de, p] as const, [p.keyword.en, p] as const]))(
    "Mock-Katalog „%s“",
    (keyword, product) => {
      // Eine Wort-Heuristik erkennt nicht jede lose Titel-Variante (dafür gibt es Claude) –
      // aber jedes Keyword muss mindestens die Hälfte seiner echten Angebote behalten.
      it("erkennt mindestens die Hälfte der passenden Angebote", () => {
        const accepted = product.titles.filter((title) => judge.judgeOne(keyword, "1", title).relevance >= minRelevance);
        expect(accepted.length, `akzeptiert: ${accepted.join(" | ")}`).toBeGreaterThanOrEqual(product.titles.length / 2);
      });

      it("sortiert Köder-Angebote aus", () => {
        for (const title of product.decoys) {
          expect(judge.judgeOne(keyword, "1", title).relevance, title).toBeLessThan(minRelevance);
        }
      });
    },
  );
});
