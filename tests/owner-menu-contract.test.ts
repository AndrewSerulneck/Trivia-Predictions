import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OWNER_MENU_ITEMS } from "@/components/owner/menu/ownerMenuItems";

/**
 * Partner Dashboard menu tripwire (docs/partner-dashboard-app-redesign-plan.md §4b, §4g).
 * Six rows (Order Join Merch added by docs/join-merch-store-plan.md), fixed order,
 * then Sign Out last with no arrow.
 */

const read = (path: string): string => readFileSync(join(__dirname, "..", path), "utf8");

describe("owner menu contract", () => {
  it("lists the six rows in the specified order", () => {
    expect(OWNER_MENU_ITEMS.map((item) => item.label)).toEqual([
      "Venue Display",
      "Order Join Merch",
      "Billing",
      "Partner Manual",
      "Game Settings",
      "Account Settings",
    ]);
  });

  it("points each link row at its page; the store and the Partner Manual open sheets", () => {
    expect(OWNER_MENU_ITEMS.map((item) => item.href ?? null)).toEqual([
      "/owner/display",
      null,
      "/owner/billing",
      null,
      "/owner/game-settings",
      "/owner/account",
    ]);
  });

  it("Order Join Merch opens the URL-mirrored store sheet, never a page or router.push", () => {
    const store = OWNER_MENU_ITEMS.find((item) => item.id === "store");
    expect(store?.sheet).toBe("store");
    expect(store?.hint).toBe("QR coasters, tents & table cards");
    expect(OWNER_MENU_ITEMS.filter((item) => item.sheet)).toHaveLength(1);
    const src = read("components/owner/OwnerAppBar.tsx");
    expect(src).toContain("pushSheet(window.history, window.location, sheet)");
    expect(src).not.toMatch(/router\.push\([^)]*sheet=/);
  });

  it("OwnerAppBar never navigates to a sheet URL, however it is built (join-merch Phase 4.1, F5)", () => {
    const src = read("components/owner/OwnerAppBar.tsx");
    // sheetHref() builds `?sheet=` URLs; the regex above can't see one passed through a variable.
    expect(src).not.toContain("sheetHref");
    // The only router navigation left is the link rows' own href.
    const navigations = src.match(/router\.(push|replace)\([^)]*\)/g) ?? [];
    expect(navigations).toEqual(["router.push(href)"]);
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

  it("dashboard header: the store button replaces the logo, only where there is no `leading` (merch-button plan Phase 1)", () => {
    const src = read("components/owner/OwnerAppBar.tsx");
    expect(src).not.toContain("ExplodingLogo");
    // Sub-pages (leading = ExitBackButton) keep the 40 px spacer; the dashboard gets the button.
    expect(src).toContain('{leading ? <span aria-hidden="true" className="h-10 w-10 shrink-0" /> : <HeaderStoreButton />}');
    expect(src.match(/<HeaderStoreButton \/>/g) ?? []).toHaveLength(1);
  });

  it("the header store button opens the store sheet in place, with dialog semantics and the agreed labels", () => {
    const src = read("components/owner/OwnerAppBar.tsx");
    const view = src.slice(src.indexOf("const HeaderStoreButtonView"), src.indexOf("const HeaderStoreButtonLive"));
    expect(view).toContain('openDashboardSheet("store")');
    expect(view).not.toContain("router.");
    expect(view).toContain('aria-haspopup="dialog"');
    expect(view).toContain("aria-expanded={expanded}");
    expect(view).toContain('aria-label="Order Join Merch"');
    expect(view).toContain("<ShoppingBag");
    // One short label at every width (Andrew): "Shop".
    expect(view).toMatch(/className="font-\[1000\]">\s*Shop\s*</);
    // aria-expanded follows the URL-mirrored sheet, behind its own Suspense (useSearchParams).
    expect(src).toContain('parseSheetParam(useSearchParams().get(SHEET_PARAM)) === "store"');
    expect(src).toContain("<Suspense fallback={<HeaderStoreButtonView expanded={false} />}>");
  });
});
