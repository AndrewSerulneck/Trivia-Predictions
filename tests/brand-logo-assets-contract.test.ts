import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = join(dir, name);
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });

describe("brand logo assets (speed plan Phase 2)", () => {
  it("serves small WebP logos, each far below the 1.7 MB original", () => {
    for (const size of [96, 192, 512]) {
      const { size: bytes } = statSync(join(ROOT, `public/brand/web/htc-logo-${size}.webp`));
      expect(bytes).toBeLessThan(100 * 1024);
    }
  });

  it("no page or component loads the 1.7 MB originals", () => {
    const files = [...walk("app"), ...walk("components")].filter((f) => /\.(tsx?|css)$/.test(f));
    const offenders = files.filter((f) => {
      const src = readFileSync(join(ROOT, f), "utf8");
      if (f === "app/info/layout.tsx") return /HTC_Logo_Final/.test(src); // schema.org logo URL keeps the PNG
      return /brand\/htc-logo\.png|HTC_Logo_Final/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("the root layout does not preload a logo on every page", () => {
    expect(readFileSync(join(ROOT, "app/layout.tsx"), "utf8")).not.toMatch(/rel="preload"[^>]*brand\//);
  });

  it("/brand/web/* is cached immutably, and only that path", () => {
    const cfg = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    expect(cfg).toMatch(/source: "\/brand\/web\/:path\*"[\s\S]*?public, max-age=31536000, immutable/);
    expect(cfg.match(/max-age=31536000/g)).toHaveLength(1);
  });
});
