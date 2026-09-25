import { describe, expect, it } from "vitest";
import { makeTestConfig } from "@/scoring/test-config";
import { effortOption } from "./claude-options";

describe("effortOption", () => {
  const config = makeTestConfig();

  it("lässt effort bei Haiku 4.5 weg (sonst HTTP 400)", () => {
    expect(effortOption("claude-haiku-4-5", config)).toEqual({});
  });

  it("setzt effort bei Modellen, die ihn unterstützen", () => {
    expect(effortOption("claude-sonnet-5", config)).toEqual({ effort: "low" });
    expect(effortOption("claude-opus-5", config)).toEqual({ effort: "low" });
  });
});
