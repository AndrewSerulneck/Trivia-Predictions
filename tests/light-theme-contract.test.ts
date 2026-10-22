import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_PREFERENCE,
  isLightThemePath,
  parseThemePreference,
  resolveTheme,
  THEME_ATTRIBUTE,
  themePrePaintScript,
  type ThemePreference,
} from "@/lib/theme";

// docs/light-theme-plan.md, Phase 2: the light theme's plumbing. Dark is the default, only four
// screens can turn light, the decision lives in lib/theme.ts alone, and the root layout never
// reads cookies or headers (that would make every static page a per-visit render).

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string): string => readFileSync(path.join(ROOT, relativePath), "utf8");

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) out.push(rel);
  }
  return out;
};

const PATHS = {
  light: ["/venue/venue-uptown", "/venue/abc/", "/pickem", "/pickem/nba", "/nfl-pickem", "/fantasy", "/fantasy/wnba"],
  dark: [
    "/",
    "/venue/abc/redeem",
    "/venue/abc/screen",
    "/trivia",
    "/trivia/live",
    "/bingo",
    "/category-blitz/play",
    "/nfl-pickem/extra",
    "/pickems",
    "/fantasyx",
    "/owner/dashboard",
    "/admin",
    "/redeem-prizes",
  ],
};

describe("which screens can be light", () => {
  it("only the venue hub, Pick 'Em, NFL Pick 'Em and Fantasy", () => {
    for (const p of PATHS.light) expect(isLightThemePath(p), p).toBe(true);
    for (const p of PATHS.dark) expect(isLightThemePath(p), p).toBe(false);
  });

  it("starts everyone on dark and resolves light only on a light-capable path", () => {
    expect(DEFAULT_THEME_PREFERENCE).toBe("dark");
    expect(parseThemePreference(null)).toBe("dark");
    expect(parseThemePreference("LIGHT")).toBe("dark");
    expect(resolveTheme("light", "/pickem", false)).toBe("light");
    expect(resolveTheme("light", "/trivia", false)).toBe("dark");
    expect(resolveTheme("system", "/fantasy", true)).toBe("light");
    expect(resolveTheme("system", "/fantasy", false)).toBe("dark");
    expect(resolveTheme("dark", "/fantasy", true)).toBe("dark");
  });
});

describe("pre-paint script", () => {
  const run = (stored: string | null, pathname: string, prefersLight: boolean, storageThrows = false): boolean => {
    const attributes = new Map<string, string>();
    const localStorage = {
      getItem: () => {
        if (storageThrows) throw new Error("blocked");
        return stored;
      },
    };
    const window = { matchMedia: () => ({ matches: prefersLight }) };
    const document = { documentElement: { setAttribute: (key: string, value: string) => attributes.set(key, value) } };
    new Function("localStorage", "location", "window", "document", themePrePaintScript())(localStorage, { pathname }, window, document);
    return attributes.get(THEME_ATTRIBUTE) === "light";
  };

  it("makes exactly the decision resolveTheme makes", () => {
    const stored: Array<string | null> = [null, "", "nonsense", "dark", "light", "system"];
    for (const value of stored) {
      for (const p of [...PATHS.light, ...PATHS.dark]) {
        for (const prefersLight of [false, true]) {
          const expected = resolveTheme(parseThemePreference(value) as ThemePreference, p, prefersLight) === "light";
          expect(run(value, p, prefersLight), `${value} ${p} ${prefersLight}`).toBe(expected);
        }
      }
    }
  });

  it("leaves the page dark when storage is blocked", () => {
    expect(run("light", "/pickem", true, true)).toBe(false);
  });
});

describe("one home, no per-visit render", () => {
  const scanned = [...sourceFiles("app"), ...sourceFiles("components"), ...sourceFiles("lib"), "proxy.ts"];

  it("lib/theme.ts is the only reader of the flag and of the stored preference", () => {
    const offenders = scanned.filter((file) => {
      if (file === path.join("lib", "theme.ts")) return false;
      const text = read(file);
      return text.includes("NEXT_PUBLIC_LIGHT_THEME_ENABLED") || text.includes('"htc_theme"') || text.includes("'htc_theme'");
    });
    expect(offenders).toEqual([]);
  });

  it("the root layout never reads cookies or headers", () => {
    const layout = read("app/layout.tsx");
    expect(layout).not.toMatch(/from\s+["']next\/headers["']/);
    expect(layout).not.toMatch(/\b(cookies|headers)\(\)/);
    expect(layout).toContain("suppressHydrationWarning");
  });
});

const block = (css: string, selector: string): Map<string, string> => {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("\n}", start);
  const tokens = new Map<string, string>();
  for (const match of css.slice(start, end).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tokens.set(match[1], match[2].trim());
  return tokens;
};

const CSS_FILES = ["app/globals.css", "design-system/hightop-challenge-design-system/project/colors_and_type.css"];

describe("colour tokens", () => {
  for (const file of CSS_FILES) {
    it(`${file}: every light token also exists in :root, with color-scheme light`, () => {
      const css = read(file);
      const dark = block(css, ":root");
      const light = block(css, ':root[data-theme="light"]');
      expect(light.size).toBeGreaterThan(0);
      for (const name of light.keys()) expect(dark.has(name), name).toBe(true);
      expect(css.slice(css.indexOf(':root[data-theme="light"] {'))).toMatch(/color-scheme:\s*light;/);
    });

    it(`${file}: every -rgb token is a channel triple in both themes`, () => {
      const css = read(file);
      for (const selector of [":root", ':root[data-theme="light"]']) {
        for (const [name, value] of block(css, selector)) {
          if (name.endsWith("-rgb")) expect(value, `${selector} ${name}`).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
        }
      }
    });
  }

  it("the design system and app/globals.css define the same light values", () => {
    const [app, design] = CSS_FILES.map((file) => block(read(file), ':root[data-theme="light"]'));
    expect(Object.fromEntries(app)).toEqual(Object.fromEntries(design));
  });

  it("every light text colour reaches 4.5:1 on white", () => {
    const channels = (value: string): number[] =>
      value.startsWith("#") ? [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) : value.split(" ").map(Number);
    const luminance = (rgb: number[]): number => {
      const [r, g, b] = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const light = block(read("app/globals.css"), ':root[data-theme="light"]');
    const textTokens = [...light.keys()].filter(
      (name) => (name.startsWith("--ht-fg-") && name !== "--ht-fg-dim") || /-(accent|fg|points|countdown|countdown-label)-rgb$/.test(name)
    );
    expect(textTokens.length).toBeGreaterThan(8);
    for (const name of textTokens) {
      const ratio = (1 + 0.05) / (luminance(channels(light.get(name) ?? "")) + 0.05);
      expect(ratio, name).toBeGreaterThanOrEqual(4.5);
    }
  });
});
