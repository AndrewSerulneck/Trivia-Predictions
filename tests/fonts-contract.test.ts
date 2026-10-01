import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 6, finding F3:
// Bree Serif and Nunito are self-hosted by `next/font` in app/layout.tsx. The
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

  it("the root layout declares both families through next/font/google", () => {
    expect(LAYOUT).toContain('from "next/font/google"');
    expect(LAYOUT).toContain("Bree_Serif({");
    expect(LAYOUT).toContain("Nunito({");
    expect(LAYOUT).toContain('variable: "--font-bree-serif"');
    expect(LAYOUT).toContain('variable: "--font-nunito"');
    // `swap` keeps text visible in the metric-matched fallback while the real
    // face downloads, instead of blocking paint on it.
    expect(LAYOUT).toContain('display: "swap"');
  });

  it("applies both font variables to <html>, so :root can read them", () => {
    expect(LAYOUT).toContain("${breeSerif.variable} ${nunito.variable}");
  });

  it("the design tokens are what point at the next/font variables", () => {
    expect(GLOBALS).toContain("--ht-font-display: var(--font-bree-serif)");
    expect(GLOBALS).toContain("--ht-font-body:    var(--font-nunito)");
  });
});

describe("every call site goes through the font tokens", () => {
  // Next 16 keeps the real family names, so a literal "Bree Serif" still
  // RESOLVES — but it resolves without the metric-matched "Bree Serif Fallback"
  // face that next/font generates and only `.variable` carries, so it silently
  // gives up the layout-shift protection. That is why this is a hard rule and
  // not a style preference.
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
    }
    expect(offenders).toEqual([]);
  });

  it("globals.css only names the families inside its explanatory comment", () => {
    const code = stripComments(GLOBALS);
    expect(code).not.toContain("Bree Serif");
    expect(code).not.toContain('"Nunito"');
  });
});
