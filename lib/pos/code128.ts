// Code 128 barcode encoder (docs/pos-rewards-integration-plan.md Phase 2).
//
// Square's Gift Cards API returns a card's number (GAN) but no barcode image, so the guest's
// coupon draws one itself. A USB/Bluetooth barcode scanner on a Square register "types" what
// it reads, so a Code 128 of the bare GAN lands in Square's manual gift-card field exactly as
// if staff had keyed it. Staff without a scanner type the big printed number instead.
//
// Pure and client-safe. Output is a list of module widths (bar, space, bar, …), starting and
// ending with a bar, quiet zones excluded — the component adds those.

// The standard Code 128 symbol table: values 0–102 data, 103/104/105 Start A/B/C, 106 Stop.
// Each digit is a bar or space width in modules; every symbol is 11 modules (Stop is 13).
const PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

export const CODE128_PATTERNS = PATTERNS;

const START_B = 104;
const START_C = 105;
const STOP = 106;

/** Symbol values (start, data, checksum, stop) for `text`. Throws on characters outside printable ASCII. */
export const code128Values = (text: string): number[] => {
  if (!text) throw new Error("Code 128: nothing to encode.");
  const digitsOnly = /^\d+$/.test(text) && text.length % 2 === 0;
  const values: number[] = [];
  if (digitsOnly) {
    // Set C packs two digits per symbol — a 16-digit GAN is 8 symbols, short and easy to scan.
    values.push(START_C);
    for (let i = 0; i < text.length; i += 2) values.push(Number(text.slice(i, i + 2)));
  } else {
    values.push(START_B);
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code < 32 || code > 126) throw new Error("Code 128: only printable ASCII can be encoded.");
      values.push(code - 32);
    }
  }
  const checksum = values.reduce((sum, value, index) => sum + value * Math.max(1, index), 0) % 103;
  values.push(checksum, STOP);
  return values;
};

/** Module widths, alternating bar/space, beginning with a bar. */
export const code128Modules = (text: string): number[] =>
  code128Values(text).flatMap((value) => PATTERNS[value].split("").map(Number));
