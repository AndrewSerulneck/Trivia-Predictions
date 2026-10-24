import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import tailwindConfig from "@/tailwind.config";

// docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 6, finding F3:
// Nunito is self-hosted by `next/font` in app/layout.tsx. The
// `@import url("https://fonts.googleapis.com/...")` that used to sit on line 1
// of app/globals.css made every first load, app-wide, walk a three-step chain on
// two extra third-party origins before text settled.

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Block and line comments removed, so a documented string is not a reference. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LAYOUT = read("app/layout.tsx");
const GLOBALS = read("app/globals.css");

/** Every .ts/.tsx under `app/`, `components/` and `lib/`. */
const sourceFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) out.push(relative(ROOT, full));
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(join(ROOT, dir));
  return out;
};

describe("fonts are self-hosted, never fetched from Google (F3)", () => {
  it("globals.css has no Google Fonts @import", () => {
    expect(GLOBALS).not.toContain("fonts.googleapis.com");
    expect(GLOBALS).not.toContain("fonts.gstatic.com");
  });

  it("no source file reaches out to Google Fonts either", () => {
    // Comments are stripped first: app/layout.tsx names the old @import URL on
    // purpose, to record what was removed and why.
    const offenders = sourceFiles().filter((f) => {
      const code = stripComments(read(f));
      return code.includes("fonts.googleapis.com") || code.includes("fonts.gstatic.com");
    });
    expect(offenders).toEqual([]);
  });

  it("the root layout loads only Nunito through next/font/google", () => {
    expect(LAYOUT).toContain('from "next/font/google"');
    expect(LAYOUT).not.toContain("Bree_Serif");
    expect(LAYOUT).toContain("Nunito({");
    expect(LAYOUT).toContain('variable: "--font-nunito"');
    // `swap` keeps text visible in the metric-matched fallback while the real
    // face downloads, instead of blocking paint on it.
    expect(LAYOUT).toContain('display: "swap"');
  });

  it("applies the Nunito variable to <html>, so :root can read it", () => {
    expect(LAYOUT).toContain("${nunito.variable}");
    expect(LAYOUT).not.toContain("breeSerif.variable");
  });

  it("the design tokens are what point at the next/font variables", () => {
    expect(GLOBALS).toContain("--ht-font-display: var(--ht-font-body)");
    expect(GLOBALS).toContain("--ht-font-body:    var(--font-nunito)");
    expect(GLOBALS).toContain("--ht-font-mono:    var(--ht-font-body)");
  });

  it("legacy Tailwind family utilities cannot bring back other faces", () => {
    const families = tailwindConfig.theme?.extend?.fontFamily;
    expect(families).toEqual({
      sans: ["var(--ht-font-body)"],
      serif: ["var(--ht-font-body)"],
      mono: ["var(--ht-font-body)"],
    });
  });

  it("canonical and mirrored design foundations share the family aliases and dashboard scale", () => {
    for (const file of [
      "app/globals.css",
      "design-system/hightop-challenge-design-system/project/colors_and_type.css",
      "design-system/project/colors_and_type.css",
    ]) {
      const css = read(file);
      expect(css).toMatch(/--ht-font-display:\s*var\(--ht-font-body\)/);
      expect(css).toMatch(/--ht-font-mono:\s*var\(--ht-font-body\)/);
      expect(css).toContain("--ht-text-dashboard-heading: clamp(18px, 5.6vw, 22px)");
    }
  });

  it("standalone website pages load the local Nunito face without the root layout", () => {
    for (const file of ["lib/appDownloadPage.ts", "app/global-error.tsx"]) {
      expect(read(file)).toContain("/fonts/nunito-v1.css");
    }
    const css = read("public/fonts/nunito-v1.css");
    expect(css).toContain('/fonts/nunito-latin-v1.woff2');
    // The root layout retains next/font's metric-matched fallback when present.
    expect(css).toContain("var(--font-nunito,");
    expect(css).not.toMatch(/--font-nunito\s*:/);
    expect(readFileSync(join(ROOT, "public/fonts/nunito-latin-v1.woff2")).subarray(0, 4).toString()).toBe("wOF2");
    expect(read("public/fonts/nunito-OFL-v1.txt")).toContain("SIL OPEN FONT LICENSE");
  });
});

describe("every call site goes through the font tokens", () => {
  // Family tokens carry the generated metric-matched fallback. Literal faces
  // also make it too easy to reintroduce inconsistent typography.
  const LITERALS = [
    "Bree Serif",
    "Bree_Serif",
    "'Nunito'",
    '"Nunito"',
  ];

  it("no component or lib file names either family literally", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      // app/layout.tsx is where the families are legitimately declared.
      if (file === "app/layout.tsx") continue;
      const code = stripComments(read(file));
      for (const literal of LITERALS) {
        if (code.includes(literal)) offenders.push(`${file} → ${literal}`);
      }
      if (/fontFamily:\s*["'`](?!var\()/.test(code) || /\[font-family:(?!var\()/.test(code)) {
        offenders.push(`${file} → direct font-family override`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("globals.css only names the families inside its explanatory comment", () => {
    const code = stripComments(GLOBALS);
    expect(code).not.toContain("Bree Serif");
    expect(code).not.toContain('"Nunito"');
  });
});
