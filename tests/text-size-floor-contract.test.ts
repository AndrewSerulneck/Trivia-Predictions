import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import tailwindConfig from "@/tailwind.config";
import { FIXED_TEXT_SIZES, MIN_TEXT_PX, SMALLEST_ROOT_PX } from "@/lib/textSizeFloor";

// The text-size floor (lib/textSizeFloor.ts, Andrew 2026-10-07): no text smaller than
// MIN_TEXT_PX anywhere, players and partners alike. rem sizes are checked against the 13px root
// small phones use, because that is where they render smallest.

const SOURCE_DIRS = ["app", "components", "lib"];

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [path] : [];
  });

const sourceFiles = SOURCE_DIRS.flatMap(walk);

/** Smallest rendered px for a CSS length, or null when it can't be judged statically. */
const smallestPx = (value: number, unit: string): number | null => {
  if (unit === "px" || unit === "") return value;
  if (unit === "rem") return value * SMALLEST_ROOT_PX;
  return null;
};

const offenders = (text: string, pattern: RegExp, file: string): string[] =>
  [...text.matchAll(pattern)].flatMap((match) => {
    const px = smallestPx(Number(match[1]), match[2] ?? "");
    // em / % depend on the parent size, so they can't prove the floor: not allowed below 1em / 100%.
    const relativeTooSmall = (match[2] === "em" && Number(match[1]) < 1) || (match[2] === "%" && Number(match[1]) < 100);
    return (px !== null && px < MIN_TEXT_PX) || relativeTooSmall ? [`${file}: ${match[0]}`] : [];
  });

describe("text-size floor", () => {
  it("no arbitrary Tailwind text size renders below the floor (use text-caption / text-footnote)", () => {
    const found = sourceFiles.flatMap((file) =>
      offenders(readFileSync(file, "utf8"), /text-\[(\d*\.?\d+)(px|rem|em|%)\]/g, file),
    );
    expect(found).toEqual([]);
  });

  it("no inline style font size renders below the floor", () => {
    const found = sourceFiles.flatMap((file) =>
      offenders(readFileSync(file, "utf8"), /fontSize:\s*["'`]?(\d*\.?\d+)(px|rem|em|%)?["'`]?\s*[,}\n]/g, file),
    );
    expect(found).toEqual([]);
  });

  it("no CSS font-size in app/globals.css renders below the floor", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(offenders(css, /font-size:\s*(\d*\.?\d+)(px|rem|em|%)/g, "app/globals.css")).toEqual([]);
  });

  it("Tailwind's xs/sm are floored for the small-phone root, and the fixed tokens exist", () => {
    const fontSize = (tailwindConfig.theme?.extend?.fontSize ?? {}) as Record<string, unknown>;
    expect(fontSize.xs).toEqual([`max(0.75rem, ${MIN_TEXT_PX}px)`, { lineHeight: "1rem" }]);
    expect(String((fontSize.sm as [string])[0])).toContain("max(0.875rem,");
    expect(fontSize.caption).toBe(FIXED_TEXT_SIZES.caption);
    expect(fontSize.footnote).toBe(FIXED_TEXT_SIZES.footnote);
    expect(FIXED_TEXT_SIZES.caption).toBe(`${MIN_TEXT_PX}px`);
  });
});
