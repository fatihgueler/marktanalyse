/**
 * Kurzer Produktname aus einem Händlertitel – regelbasiert, ohne KI.
 * „Factory Wholesale Pocket Photo Printer Inkless Labels“ → „Pocket Photo Printer“
 * „Sunset Projection Lamp 16 Colors USB Rainbow Night Light“ → „Sunset Projection Lamp“
 */

/** Werbefloskeln, die nichts über das Produkt sagen (Kleinbuchstaben, als ganze Wortfolge) */
const FILLER_PHRASES = [
  "factory wholesale",
  "factory direct",
  "hot sale",
  "hot selling",
  "best seller",
  "free shipping",
  "high quality",
  "brand new",
  "new arrival",
  "dropshipping",
  "wholesale",
  "upgraded",
  "upgrade",
  "original",
  "official",
  "new",
  "hot",
];

/** Ab hier folgt meist Zubehör, Einsatzort oder Ausstattung */
const CUT_WORDS = new Set(["with", "for", "mit", "für", "and", "und", "&", "set", "kit"]);
/** Spezifikationen: 16 Colors, 360°, 2pcs, 10000mAh, 4K, USB, LED-Zahlen … */
const SPEC_PATTERN = /^(\d+([.,]\d+)?(pcs|pc|stk|x|°|w|v|mah|cm|mm|m|ml|l|g|kg|inch|in|k|gb|tb|hz|colou?rs?|modes?|farben)?|\d+-\w+|usb|usb-c|type-c|rgb|bluetooth|wifi|app|remote|rechargeable|portable|wireless)$/i;
const MAX_WORDS = 4;
const MIN_LENGTH = 3;

export function shortTitle(title: string): string {
  let text = ` ${title.replace(/[([{].*?[)\]}]/g, " ").replace(/\s+/g, " ").trim()} `;
  for (const phrase of FILLER_PHRASES) {
    text = text.replace(new RegExp(` ${phrase.replace(/ /g, "\\s+")}(?= )`, "gi"), " ");
  }
  // Bei Trennzeichen abschneiden: „Lampe, 16 Farben“, „Lampe - USB“, „Lampe | Deko“
  text = text.split(/\s[-–|/]\s|,|;|\|/)[0] ?? text;

  const words: string[] = [];
  for (const word of text.trim().split(" ")) {
    if (!word) continue;
    if (CUT_WORDS.has(word.toLowerCase()) && words.length > 0) break;
    if (SPEC_PATTERN.test(word)) {
      if (words.length >= 2) break;
      continue;
    }
    words.push(word);
    if (words.length === MAX_WORDS) break;
  }
  const result = words.join(" ").trim();
  return result.length >= MIN_LENGTH ? result : title.trim();
}
