import { describe, expect, it } from "vitest";
import { parseRunOptions } from "./run-options";

describe("parseRunOptions", () => {
  it("ohne Optionen: voller Lauf", () => {
    expect(parseRunOptions(["--live"])).toEqual({ maxSearches: null, countries: null });
  });

  it("liest Suchbudget und Länder (Reihenfolge wie in der Config)", () => {
    expect(parseRunOptions(["--live", "--max-searches=100", "--countries=at, de"])).toEqual({
      maxSearches: 100,
      countries: ["DE", "AT"],
    });
  });

  it("lehnt ungültige Werte ab", () => {
    expect(() => parseRunOptions(["--max-searches=0"])).toThrow(/ganze Zahl/);
    expect(() => parseRunOptions(["--max-searches=abc"])).toThrow(/ganze Zahl/);
    expect(() => parseRunOptions(["--countries=FR"])).toThrow(/kennt nur/);
    expect(() => parseRunOptions(["--countries="])).toThrow(/kennt nur/);
  });
});
