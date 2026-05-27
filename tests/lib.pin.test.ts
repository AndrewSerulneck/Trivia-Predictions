import { describe, expect, it } from "vitest";
import { isValidPin, normalizePin, normalizePinDigits } from "@/lib/pin";

describe("lib/pin", () => {
  it("normalizes Arabic-Indic digits to ASCII", () => {
    expect(normalizePinDigits("١٢٣٤")).toBe("1234");
    expect(normalizePin("١٢٣٤")).toBe("1234");
  });

  it("normalizes full-width digits to ASCII", () => {
    expect(normalizePinDigits("１２３４")).toBe("1234");
  });

  it("validates normalized 4-digit PINs", () => {
    expect(isValidPin("١٢٣٤")).toBe(true);
    expect(isValidPin("123")).toBe(false);
  });
});
