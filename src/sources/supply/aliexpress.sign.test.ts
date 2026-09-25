import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signAliExpressParams } from "./aliexpress.sign";

describe("signAliExpressParams", () => {
  it("sortiert Parameter, verkettet key+value und signiert mit HMAC-SHA256 (Großbuchstaben)", () => {
    const signature = signAliExpressParams({ timestamp: "1", app_key: "k", method: "m" }, "secret");
    const expected = createHmac("sha256", "secret").update("app_keykmethodmtimestamp1").digest("hex").toUpperCase();
    expect(signature).toBe(expected);
  });

  it("ignoriert einen vorhandenen sign-Parameter", () => {
    const params = { app_key: "k", method: "m" };
    expect(signAliExpressParams({ ...params, sign: "OLD" }, "s")).toBe(signAliExpressParams(params, "s"));
  });
});
