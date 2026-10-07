import { describe, expect, it } from "vitest";
import { formatMoneyRounded } from "./format";

describe("formatMoneyRounded", () => {
  // Intl setzt ein geschütztes Leerzeichen vor das Währungszeichen.
  const plain = (text: string) => text.replace(/\u00a0/g, " ");
  it("lässt Cent ab 10 weg, darunter nicht", () => {
    expect(plain(formatMoneyRounded(35.18, "EUR"))).toBe("35 €");
    expect(plain(formatMoneyRounded(4.6, "EUR"))).toBe("4,60 €");
    expect(plain(formatMoneyRounded(-3.2, "GBP"))).toBe("-3,20 £");
  });
});
