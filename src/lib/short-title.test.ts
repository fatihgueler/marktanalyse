import { describe, expect, it } from "vitest";
import { shortTitle } from "./short-title";

describe("shortTitle", () => {
  it.each([
    ["Factory Wholesale Pocket Photo Printer Inkless Labels", "Pocket Photo Printer Inkless"],
    ["Factory Wholesale Mini Thermal Printer Portable Bluetooth Sticker Printer", "Mini Thermal Printer"],
    ["Sunset Projection Lamp 16 Colors USB Rainbow Night Light", "Sunset Projection Lamp"],
    ["Astronaut Star Projector with Timer and Remote", "Astronaut Star Projector"],
    ["2026 New Upgraded LED Cloud Lamp (Remote Control), Bedroom Decor", "LED Cloud Lamp"],
    ["Hot Sale Pet Water Fountain - Automatic 2L", "Pet Water Fountain"],
  ])("%s → %s", (title, expected) => {
    expect(shortTitle(title)).toBe(expected);
  });

  it("fällt auf den Originaltitel zurück, wenn nichts Sinnvolles übrig bleibt", () => {
    expect(shortTitle("USB 2pcs")).toBe("USB 2pcs");
  });
});
