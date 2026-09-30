import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OWNER_MENU_ITEMS } from "@/components/owner/menu/ownerMenuItems";

/**
 * Partner Dashboard menu tripwire (docs/partner-dashboard-app-redesign-plan.md §4b, §4g).
 * Six rows, fixed order, Sign Out last with no arrow.
 */

const read = (path: string): string => readFileSync(join(__dirname, "..", path), "utf8");

describe("owner menu contract", () => {
  it("lists the five rows in the specified order", () => {
    expect(OWNER_MENU_ITEMS.map((item) => item.label)).toEqual([
      "Venue Display",
      "Billing",
      "Partner Manual",
      "Game Settings",
      "Account Settings",
    ]);
  });

  it("points each row at its page; only the Partner Manual opens a sheet", () => {
    expect(OWNER_MENU_ITEMS.map((item) => item.href ?? null)).toEqual([
      "/owner/display",
      "/owner/billing",
      null,
      "/owner/game-settings",
      "/owner/account",
    ]);
  });

  it("renders Sign Out after the rows, once, in the partner variant, with no arrow", () => {
    const src = read("components/owner/OwnerAppBar.tsx");
    const signOuts = src.match(/<SignOutButton/g) ?? [];
    expect(signOuts).toHaveLength(1);
    expect(src).toContain('<SignOutButton variant="partner" />');
    expect(src.indexOf("<SignOutButton")).toBeGreaterThan(src.indexOf("OWNER_MENU_ITEMS.map"));
    expect(src.indexOf("<SignOutButton")).toBeGreaterThan(src.indexOf("</nav>"));
  });

  it("keeps the dark OwnerShell on the compact bar (no big logo, no account menu)", () => {
    const src = read("components/owner/OwnerShell.tsx");
    const dark = src.slice(src.indexOf('if (variant === "dark")'), src.indexOf("const headerRow"));
    expect(dark).toContain("<OwnerAppBar");
    expect(dark).not.toContain("ExplodingLogo");
    expect(dark).not.toContain("OwnerAccountMenu");
  });
});
