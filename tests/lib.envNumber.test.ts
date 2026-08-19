import { describe, expect, it } from "vitest";
import { intFromEnv, floatFromEnv } from "@/lib/envNumber";

describe("envNumber", () => {
  const intCases: Array<[string | undefined, number, number]> = [
    [undefined, 50, 50],
    ["", 50, 50],
    ["abc", 50, 50],
    ["0", 50, 0],
    ["-3", 50, -3],
    ["12", 50, 12],
  ];

  it.each(intCases)("intFromEnv(%s, %s) === %s", (raw, fallback, expected) => {
    expect(intFromEnv(raw, fallback)).toBe(expected);
  });

  const floatCases: Array<[string | undefined, number, number]> = [
    [undefined, 0.25, 0.25],
    ["", 0.25, 0.25],
    ["abc", 0.25, 0.25],
    ["0", 0.25, 0],
    ["0.18", 0.25, 0.18],
    ["-1.5", 0.25, -1.5],
  ];

  it.each(floatCases)("floatFromEnv(%s, %s) === %s", (raw, fallback, expected) => {
    expect(floatFromEnv(raw, fallback)).toBe(expected);
  });

  it("does not propagate NaN when the raw value fails to parse", () => {
    expect(Number.isNaN(intFromEnv("garbage", 7))).toBe(false);
    expect(Number.isNaN(floatFromEnv("garbage", 7))).toBe(false);
  });
});
