import { describe, expect, it } from "vitest";
import { makeTestConfig } from "@/scoring/test-config";
import { DEFAULT_CLAUDE_MODEL, effortOption } from "./claude-options";

describe("effortOption", () => {
  const config = makeTestConfig();

  it("lässt effort bei Haiku 4.5 weg (sonst HTTP 400)", () => {
    expect(effortOption("claude-haiku-4-5", config)).toEqual({});
  });

  it("setzt effort bei Modellen, die ihn unterstützen – auch beim Standardmodell Haiku 5.5", () => {
    expect(effortOption(DEFAULT_CLAUDE_MODEL, config)).toEqual({ effort: "low" });
    expect(effortOption("claude-haiku-5-5", config)).toEqual({ effort: "low" });
    expect(effortOption("claude-sonnet-5-5", config)).toEqual({ effort: "low" });
    expect(effortOption("claude-sonnet-5", config)).toEqual({ effort: "low" });
    expect(effortOption("claude-opus-5", config)).toEqual({ effort: "low" });
  });
});
