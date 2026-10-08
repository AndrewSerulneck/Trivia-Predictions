import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { decideDomainSplit } from "@/lib/domainSplit";
import { LEGAL_LINKS } from "@/lib/legalInfo";

/**
 * Legal/support pages tripwire (docs/native-app-store-plan.md Phase 1a). Both app
 * stores require a reachable privacy policy, and Apple 5.3.3 requires the
 * "not a sponsor" sentence in the contest rules.
 */

const read = (path: string): string => readFileSync(join(__dirname, "..", path), "utf8");

describe("legal pages", () => {
  it("has a page for every legal link", () => {
    for (const link of LEGAL_LINKS) {
      expect(existsSync(join(__dirname, "..", "app", link.href, "page.tsx")), link.href).toBe(true);
    }
  });

  it("lists every legal page in the sitemap", () => {
    const urls = sitemap().map((entry) => new URL(entry.url).pathname);
    for (const link of LEGAL_LINKS) expect(urls).toContain(link.href);
  });

  it("serves them from the apex when the domain split is on, and bounces play. to the apex", () => {
    const saved = process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED;
    process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED = "true";
    try {
      for (const link of LEGAL_LINKS) {
        expect(decideDomainSplit("hightopchallenge.com", link.href)).toEqual({ action: "none" });
        expect(decideDomainSplit("play.hightopchallenge.com", link.href)).toEqual({
          action: "redirect",
          host: "hightopchallenge.com",
        });
      }
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED;
      else process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED = saved;
    }
  });

  it("keeps the Apple non-sponsor statement and no-purchase wording in the Official Rules", () => {
    const rules = read("app/rules/page.tsx");
    expect(rules).toMatch(/Apple Inc\. and Google LLC are not sponsors of, and are not involved in/);
    expect(rules).toMatch(/NO PURCHASE NECESSARY/);
  });

  it("links the legal pages from the home footer, the player drawer and the partner drawer", () => {
    for (const file of [
      "app/info/page.tsx",
      "components/navigation/AccountMenuList.tsx",
      "components/owner/OwnerAppBar.tsx",
    ]) {
      expect(read(file), file).toContain("LEGAL_LINKS");
    }
  });
});
