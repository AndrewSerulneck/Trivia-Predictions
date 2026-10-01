import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 3: the loader is
// CSS keyframes, not framer-motion, and carries no inline styles — that is what lets
// it play before a page's own JavaScript has run and keeps it off the main thread.

const ROOT = process.cwd();
const loader = readFileSync(join(ROOT, "components/ui/HightopLoader.tsx"), "utf8");
const tailwind = readFileSync(join(ROOT, "tailwind.config.ts"), "utf8");

describe("HightopLoader contract", () => {
  it("imports no framer-motion", () => {
    expect(loader).not.toMatch(/from "framer-motion"/);
    expect(loader).not.toMatch(/require\("framer-motion"\)/);
  });

  it("uses no inline style (Tailwind utilities only)", () => {
    expect(loader).not.toMatch(/style=\{/);
    expect(loader).not.toMatch(/style="/);
  });

  it("uses no `!` important utilities", () => {
    expect(loader).not.toMatch(/className=.*\s!\w/);
  });

  it("declares every animation it uses in tailwind.config.ts", () => {
    const used = [...loader.matchAll(/animate-(logo-[a-z-]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const name of new Set(used)) {
      expect(tailwind).toMatch(new RegExp(`"${name}":\\s*"`));
    }
  });

  it("animates only transform and opacity in the loader keyframes", () => {
    const names = ["logo-arrive", "logo-arrive-spin", "logo-arrive-shadow", "logo-hop", "logo-spin", "logo-hop-shadow", "logo-pulse"];
    for (const name of names) {
      const start = tailwind.indexOf(`"${name}": {`);
      expect(start, `${name} keyframes missing`).toBeGreaterThan(-1);
      const block = tailwind.slice(start, tailwind.indexOf("\n        },", start));
      const properties = [...block.matchAll(/([a-zA-Z]+):\s*"/g)].map((m) => m[1]);
      for (const property of properties) {
        expect(["transform", "opacity", "animationTimingFunction"], `${name} animates ${property}`).toContain(property);
      }
    }
  });

  it("spins one way, pauses, then spins the other (Andrew's Q2 answer)", () => {
    const start = tailwind.indexOf('"logo-spin": {');
    const block = tailwind.slice(start, tailwind.indexOf("\n        },", start));
    // 0deg → 360deg (held across the landing) → 0deg: a full turn each way, net zero.
    expect(block.match(/rotate\(360deg\)/g)).toHaveLength(1);
    expect(block.match(/rotate\(0deg\)/g)).toHaveLength(2);
    expect(block).toMatch(/"36%, 59%"/);
  });

  it("chains the entrance into the endless loop with one animation shorthand", () => {
    for (const name of ["body", "spin", "shadow"]) {
      expect(tailwind).toMatch(new RegExp(`"logo-loader-${name}": "logo-arrive[a-z-]* 0\\.95s[^"]*, logo-[a-z-]+ 2\\.6s[^"]*0\\.95s infinite"`));
    }
  });

  it("honours Reduce Motion with a fade pulse and no hop", () => {
    expect(loader).toMatch(/motion-reduce:animate-none/);
    expect(loader).toMatch(/motion-reduce:animate-logo-pulse/);
    expect(tailwind).toMatch(/"logo-pulse": "logo-pulse 1\.6s ease-in-out infinite"/);
  });

  it("is announced as a status with an overridable label", () => {
    expect(loader).toMatch(/role="status"/);
    expect(loader).toMatch(/label = "Loading…"/);
  });

  it("loads the shared 192 px WebP, never the 1.7 MB original", () => {
    expect(loader).toMatch(/\/brand\/web\/htc-logo-192\.webp/);
    expect(loader).not.toMatch(/htc-logo\.png|HTC_Logo_Final/);
  });
});
