import { describe, expect, it } from "vitest";
import { makeTestConfig } from "@/scoring/test-config";
import { groupMovement, indexPrevious } from "./movement";

const config = makeTestConfig();
const previous = indexPrevious([
  { productId: "p1", keyword: "wolkenlampe", country: "DE", totalScore: 60 },
  { productId: "p1", keyword: "wolkenlampe", country: "DE", totalScore: 55 },
  { productId: "p2", keyword: "cloud lamp", country: "AT", totalScore: 70 },
]);

describe("groupMovement", () => {
  it("meldet Produkte, die im Vergleichslauf fehlten, als neu", () => {
    expect(groupMovement([{ productId: "p9", keyword: "pixel frame", country: "DE", totalScore: 80 }], previous, config)).toEqual({ kind: "neu" });
  });

  it("vergleicht je Land – dasselbe Produkt in einem neuen Land ist neu", () => {
    expect(groupMovement([{ productId: "p1", keyword: "wolkenlampe", country: "CH", totalScore: 80 }], previous, config)).toEqual({ kind: "neu" });
  });

  it("erkennt ein bekanntes Produkt auch über das Keyword (anderes Angebot)", () => {
    expect(groupMovement([{ productId: "p7", keyword: "Wolkenlampe ", country: "DE", totalScore: 65 }], previous, config)).toBeNull();
  });

  it("meldet „gestiegen“ ab der Schwelle, gemessen am besten früheren Score", () => {
    expect(groupMovement([{ productId: "p1", keyword: "wolkenlampe", country: "DE", totalScore: 70.4 }], previous, config)).toEqual({ kind: "gestiegen", delta: 10 });
    expect(groupMovement([{ productId: "p1", keyword: "wolkenlampe", country: "DE", totalScore: 69 }], previous, config)).toBeNull();
  });

  it("nimmt bei Gruppen über mehrere Länder jeweils den besten Wert", () => {
    const rows = [
      { productId: "p1", keyword: "wolkenlampe", country: "DE", totalScore: 72 },
      { productId: "p2", keyword: "cloud lamp", country: "AT", totalScore: 79 },
    ];
    // vorher bestes 70 (AT), jetzt bestes 79 → +9, unter der Schwelle
    expect(groupMovement(rows, previous, config)).toBeNull();
  });

  it("meldet sinkende Produkte nicht", () => {
    expect(groupMovement([{ productId: "p2", keyword: "cloud lamp", country: "AT", totalScore: 40 }], previous, config)).toBeNull();
  });
});
