import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const page = readFileSync(join(root, "app/info/page.tsx"), "utf8");

describe("/info Partner Login and Square badge (Phase 3B.2)", () => {
  it("has a Partner Login link visible on phones outside the hamburger menu", () => {
    const anchors = [...page.matchAll(/<a\s+href="\/owner\/login"[\s\S]*?<\/a>/g)].map((m) => m[0]);
    const phoneHeader = anchors.filter((a) => a.includes("md:hidden") && a.includes("Partner Login") && !a.includes("onClick"));
    expect(phoneHeader).toHaveLength(1);
    expect(phoneHeader[0]).toContain("min-h-11");
  });

  it("keeps every /owner/login link a plain anchor (apex page) and drops the old hero wording", () => {
    expect(page).not.toMatch(/<Link\s+href="\/owner\/login"/);
    expect(page).not.toContain("Already a partner? Sign in");
  });

  it("tells partners the dashboard is browser-based, with the approved copy", () => {
    expect(page).toContain(
      "Venue partners: schedule games, set rewards and manage billing from any web browser — no app needed.",
    );
  });

  it("shows Square's badge whole, with alt text, 40 px clear space and a small optimized file", () => {
    expect(page).toContain('src="/brand/partners/built-with-square-badge.webp"');
    expect(page).toContain('alt="Built with Square"');
    expect(page).toMatch(/my-10/);
    const file = join(root, "public/brand/partners/built-with-square-badge.webp");
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeLessThan(30 * 1024);
    expect(existsSync(join(root, "assets/partner-src/built-with-square-badge.png"))).toBe(true);
  });
});
