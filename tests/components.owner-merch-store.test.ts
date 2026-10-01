// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  MerchStoreSheet,
  merchStoreUrlStep,
  merchStoreVenueBlock,
  resolveMerchStoreStep,
  type MerchStoreSheetProps,
} from "@/components/owner/store/MerchStoreSheet";
import { JOIN_QR_DISPLAY_URL, JOIN_QR_FILES } from "@/lib/joinQr";
import { MERCH_CATALOG, MERCH_MAX_UNIT_QTY } from "@/lib/merchCatalog";
import type { MerchCart } from "@/lib/merchPricing";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// docs/join-merch-store-plan.md. Phase 2: the store is a light, URL-driven
// dashboard sheet whose Close goes straight through (no discard prompt).
// Phase 3: the Shop (products, pack select, steppers, order bar) and the
// look-only Review.
// createElement instead of JSX (*.test.ts glob).

const fakeNav = (overrides: Partial<UseOwnerSheetResult> = {}): UseOwnerSheetResult => ({
  sheet: null,
  step: null,
  displayStepFor: () => null,
  openSheet: vi.fn(),
  goToStep: vi.fn(),
  correctStep: vi.fn(),
  goBack: vi.fn(),
  closeSheet: vi.fn(),
  ...overrides,
});

const props = (nav: UseOwnerSheetResult): MerchStoreSheetProps => ({
  nav,
  venue: { id: "v1", name: "The Hightop" },
  cart: {},
  onCartChange: vi.fn(),
});

describe("MerchStoreSheet (Phase 2 shell)", () => {
  afterEach(() => {
    cleanup();
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  it("renders nothing unless ?sheet=store", () => {
    render(createElement(MerchStoreSheet, props(fakeNav({ sheet: "schedule" }))));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens as a light tall sheet titled Order Join Merch", () => {
    render(createElement(MerchStoreSheet, props(fakeNav({ sheet: "store" }))));
    const panel = screen.getByRole("dialog", { name: "Order Join Merch" });
    expect(panel.className).toContain("bg-ht-store-paper");
    expect(panel.className).toContain("h-[92svh]");
    expect(screen.getByText("Hightop Challenge Store")).not.toBeNull();
    expect(screen.getByText(/Put a QR code on every table/)).not.toBeNull();
  });

  it("Close calls closeSheet directly — the cart is kept, so there is nothing to discard", () => {
    const nav = fakeNav({ sheet: "store" });
    render(createElement(MerchStoreSheet, props(nav)));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(nav.closeSheet).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Discard/)).toBeNull();
  });
});

// ─── Phase 3: Shop + Review ──────────────────────────────────────────────────

/** The real thing: the cart is page state, so changes flow back into the sheet. */
const StatefulStore = ({ nav, initialCart = {} }: { nav: UseOwnerSheetResult; initialCart?: MerchCart }) => {
  const [cart, setCart] = useState<MerchCart>(initialCart);
  return createElement(MerchStoreSheet, { nav, venue: { id: "v1", name: "The Hightop" }, cart, onCartChange: setCart });
};

const openShop = (initialCart: MerchCart = {}, overrides: Partial<UseOwnerSheetResult> = {}) => {
  const nav = fakeNav({ sheet: "store", ...overrides });
  render(createElement(StatefulStore, { nav, initialCart }));
  return nav;
};

const openReview = (cart: MerchCart) => {
  const nav = fakeNav({ sheet: "store", step: "review", displayStepFor: () => "review" });
  render(createElement(MerchStoreSheet, { ...props(nav), cart }));
  return nav;
};

const productRow = (name: string): HTMLElement => {
  const heading = screen.getByRole("heading", { name });
  const row = heading.closest("li");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
};

describe("MerchStoreSheet step resolution", () => {
  it("Review only when it can open (a cart AND a venue); everything else is the Shop", () => {
    expect(resolveMerchStoreStep("review", true)).toBe("review");
    expect(resolveMerchStoreStep("review", false)).toBe("shop");
    expect(resolveMerchStoreStep(null, true)).toBe("shop");
    expect(resolveMerchStoreStep("shop", true)).toBe("shop");
    expect(resolveMerchStoreStep("checkout", true)).toBe("shop");
  });

  it("the Shop has no ?step= in the URL", () => {
    expect(merchStoreUrlStep("shop")).toBeNull();
    expect(merchStoreUrlStep("review")).toBe("review");
  });
});

describe("MerchStoreSheet Shop", () => {
  afterEach(() => {
    cleanup();
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  it("renders one row per catalog product, in catalog order, with real alt text", () => {
    openShop();
    const rows = document.querySelectorAll<HTMLElement>("li[data-product]");
    expect([...rows].map((row) => row.dataset.product)).toEqual(MERCH_CATALOG.map((p) => p.id));
    for (const product of MERCH_CATALOG) {
      const img = screen.getByAltText(product.image.alt) as HTMLImageElement;
      expect(img.getAttribute("src")).toBe(product.image.src);
      expect(img.getAttribute("width")).toBe(String(product.image.width));
      expect(img.getAttribute("loading")).toBe("lazy");
      expect(within(productRow(product.name)).getByText(product.description)).not.toBeNull();
    }
  });

  it("photos sit on the paper: mix-blend-multiply, a paper-coloured box, no border", () => {
    openShop();
    for (const img of document.querySelectorAll("li[data-product] img")) {
      expect(img.className).toContain("mix-blend-multiply");
      const box = img.parentElement as HTMLElement;
      expect(box.className).toContain("bg-ht-store-paper");
      expect(box.className).not.toMatch(/\bborder\b/);
    }
  });

  it.each(["Round Coasters", "Square Coasters"])("%s: the pack select lists None + the 4 packs", (name) => {
    openShop();
    const select = within(productRow(name)).getByLabelText(/Pack size/) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "None",
      "100 coasters — $30",
      "250 coasters — $60",
      "500 coasters — $100",
      "1,000 coasters — $175",
    ]);
    expect(select.value).toBe("");
  });

  it("choosing a pack shows the pack total (no per-coaster price), and fills the order bar", () => {
    openShop();
    const row = productRow("Round Coasters");
    expect(within(row).getByText("4 pack sizes, from $30")).not.toBeNull();
    fireEvent.change(within(row).getByLabelText(/Pack size/), { target: { value: "1000" } });
    expect(row.textContent).toContain("1,000 coasters · $175.00");
    expect(row.textContent).not.toMatch(/¢|each/);
    expect(within(row).getByText("In order")).not.toBeNull();
    expect(screen.getByText(/1 item · Subtotal/)).not.toBeNull();
    fireEvent.change(within(row).getByLabelText(/Pack size/), { target: { value: "" } });
    expect(within(row).queryByText("In order")).toBeNull();
    expect(screen.getByText("Choose a quantity to start an order")).not.toBeNull();
  });

  it("the stepper adds, removes, and disables − at 0 and + at the maximum", () => {
    openShop();
    const row = productRow("Table Tents");
    const minus = within(row).getByRole("button", { name: "Decrease Table Tents" }) as HTMLButtonElement;
    const plus = within(row).getByRole("button", { name: "Increase Table Tents" }) as HTMLButtonElement;
    const field = within(row).getByLabelText("Table Tents quantity") as HTMLInputElement;
    expect(field.getAttribute("inputmode")).toBe("numeric");
    expect(minus.disabled).toBe(true);
    expect(row.textContent).toContain(`Up to ${MERCH_MAX_UNIT_QTY} per order`);
    fireEvent.click(plus);
    fireEvent.click(plus);
    expect(field.value).toBe("2");
    expect(row.textContent).toContain("2 × $4 = $8.00");
    fireEvent.click(minus);
    expect(field.value).toBe("1");
    fireEvent.change(field, { target: { value: String(MERCH_MAX_UNIT_QTY) } });
    fireEvent.blur(field);
    expect(plus.disabled).toBe(true);
  });

  it.each([
    ["150", String(MERCH_MAX_UNIT_QTY)],
    ["-3", "0"],
    ["12abc", "0"],
    ["", "0"],
    ["7", "7"],
  ])("typing %j clamps the cart now and the field on blur to %s", (typed, settled) => {
    openShop();
    const row = productRow("Table Card with Holder");
    const field = within(row).getByLabelText("Table Card with Holder quantity") as HTMLInputElement;
    fireEvent.change(field, { target: { value: typed } });
    expect(field.value).toBe(typed); // no correction while typing
    fireEvent.blur(field);
    expect(field.value).toBe(settled);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Review order is disabled with an empty cart, then advances to step=review", () => {
    const nav = openShop();
    const review = screen.getByRole("button", { name: /Review order/ }) as HTMLButtonElement;
    expect(review.disabled).toBe(true);
    expect(screen.getByText("Choose a quantity to start an order")).not.toBeNull();
    fireEvent.click(within(productRow("Table Tents")).getByRole("button", { name: "Increase Table Tents" }));
    expect(review.disabled).toBe(false);
    expect(screen.getByText(/1 item · Subtotal/).nextElementSibling?.textContent).toBe("$4.00");
    fireEvent.click(review);
    expect(nav.goToStep).toHaveBeenCalledWith("review");
  });

  it("the cart arrives from the page: a reopened store shows what was chosen", () => {
    openShop({ "coasters-square": 500, "table-card-set": 3 });
    expect((within(productRow("Square Coasters")).getByLabelText(/Pack size/) as HTMLSelectElement).value).toBe("500");
    expect((screen.getByLabelText("Table Card with Holder quantity") as HTMLInputElement).value).toBe("3");
    expect(screen.getByText(/2 items · Subtotal/)).not.toBeNull();
    expect(screen.getByText(/2 items · Subtotal/).nextElementSibling?.textContent).toBe("$124.00");
  });

  it("offers the join QR code as a free PNG and SVG download", () => {
    openShop();
    const card = document.querySelector<HTMLElement>("[data-free-qr]");
    if (!card) throw new Error("no free QR card");
    expect(within(card).getByRole("heading", { name: "Print your own QR code" })).not.toBeNull();
    expect(card.textContent).toContain(JOIN_QR_DISPLAY_URL);
    expect(within(card).getByAltText(`QR code that opens ${JOIN_QR_DISPLAY_URL}`).getAttribute("src")).toBe(
      JOIN_QR_FILES.svg.src,
    );
    for (const [name, file] of [
      [/Download PNG/, JOIN_QR_FILES.png],
      [/SVG for printers/, JOIN_QR_FILES.svg],
    ] as const) {
      const link = within(card).getByRole("link", { name });
      expect(link.getAttribute("href")).toBe(file.src);
      expect(link.getAttribute("download")).toBe(file.download);
    }
    // After the products, never between them.
    const lastProduct = [...document.querySelectorAll("li[data-product]")].at(-1);
    expect(lastProduct?.compareDocumentPosition(card)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("a stray ?step=shop is rewritten to the bare Shop URL", () => {
    const nav = openShop({}, { step: "shop", displayStepFor: () => "shop" });
    expect(nav.correctStep).toHaveBeenCalledWith(null);
  });
});

describe("MerchStoreSheet Review", () => {
  afterEach(() => {
    cleanup();
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  it("lists the order draft: lines, subtotal, shipping & tax later, estimated total, ships to", () => {
    openReview({ "coasters-round": 250, "table-tents": 6 });
    expect(screen.getByRole("heading", { name: "Review your order" })).not.toBeNull();
    const lines = document.querySelectorAll<HTMLElement>("li[data-line]");
    expect([...lines].map((l) => l.dataset.line)).toEqual(["HTC-CST-RND-250", "HTC-TENT"]);
    expect(lines[0].textContent).toContain("Round Coasters");
    expect(lines[0].textContent).toContain("Pack of 250");
    expect(lines[0].textContent).not.toMatch(/¢|each/);
    expect(lines[0].textContent).toContain("$60.00");
    expect(lines[1].textContent).toContain("6 × $4");
    expect(lines[1].textContent).toContain("$24.00");
    expect(screen.getByText("Subtotal").nextElementSibling?.textContent).toBe("$84.00");
    expect(screen.getByText("Calculated at checkout")).not.toBeNull();
    expect(screen.getByText("Estimated total").nextElementSibling?.textContent).toBe("$84.00");
    expect(screen.getByText("Ships to").nextElementSibling?.textContent).toBe("The Hightop");
    expect(screen.getByText(/Online ordering is coming soon/)).not.toBeNull();
  });

  it("the final button is disabled and reads Ordering opens soon, with the reason visible", () => {
    openReview({ "table-card-set": 2 });
    const final = screen.getByRole("button", { name: /Ordering opens soon/ }) as HTMLButtonElement;
    expect(final.disabled).toBe(true);
    expect(screen.getByText("Nothing is ordered or charged yet.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: /Review order/ })).toBeNull();
  });

  it("Back to store steps back to the Shop, which has no step in the URL (F4)", () => {
    const nav = openReview({ "table-card-set": 2 });
    fireEvent.click(screen.getByRole("button", { name: /Back to store/ }));
    expect(nav.goBack).toHaveBeenCalledWith(null);
  });

  it("an empty cart (reload, shared link) lands on the Shop and drops step=review from the URL", () => {
    const nav = openReview({});
    expect(nav.correctStep).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("heading", { name: "Review your order" })).toBeNull();
    expect(document.querySelectorAll("li[data-product]")).toHaveLength(MERCH_CATALOG.length);
  });
});

// ─── Phase 4.1 (F2): the store with no venue (still loading, or none on the account) ─────

/** The store as the page hosts it before / without a venue. */
const StatefulNoVenueStore = ({ nav, venueLoading }: { nav: UseOwnerSheetResult; venueLoading: boolean }) => {
  const [cart, setCart] = useState<MerchCart>({});
  return createElement(MerchStoreSheet, { nav, venue: null, venueLoading, cart, onCartChange: setCart });
};

describe("MerchStoreSheet with no venue (Phase 4.1, F2)", () => {
  afterEach(() => {
    cleanup();
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  it("the reason Review is off: loading vs an account with no venue; none once a venue exists", () => {
    expect(merchStoreVenueBlock(null, true)).toBe("Loading your venue…");
    expect(merchStoreVenueBlock(null, false)).toBe("Ordering needs a venue on your account.");
    expect(merchStoreVenueBlock({ id: "v1", name: "The Hightop" }, true)).toBeUndefined();
  });

  it("opens, with the products and the free QR card working", () => {
    const nav = fakeNav({ sheet: "store" });
    render(createElement(StatefulNoVenueStore, { nav, venueLoading: false }));
    expect(screen.getByRole("dialog", { name: "Order Join Merch" })).not.toBeNull();
    expect(document.querySelectorAll("li[data-product]")).toHaveLength(MERCH_CATALOG.length);
    const card = document.querySelector<HTMLElement>("[data-free-qr]");
    if (!card) throw new Error("no free QR card");
    expect(within(card).getByRole("link", { name: /Download PNG/ }).getAttribute("href")).toBe(JOIN_QR_FILES.png.src);
    expect(within(card).getByRole("link", { name: /SVG for printers/ }).getAttribute("href")).toBe(JOIN_QR_FILES.svg.src);
  });

  it("Review stays off and says why, even with items in the cart", () => {
    const nav = fakeNav({ sheet: "store" });
    render(createElement(StatefulNoVenueStore, { nav, venueLoading: false }));
    const review = screen.getByRole("button", { name: /Review order/ }) as HTMLButtonElement;
    expect(review.disabled).toBe(true);
    expect(screen.getByText("Ordering needs a venue on your account.")).not.toBeNull();
    fireEvent.click(within(productRow("Table Tents")).getByRole("button", { name: "Increase Table Tents" }));
    expect(screen.getByText(/1 item · Subtotal/)).not.toBeNull();
    expect(review.disabled).toBe(true);
    expect(document.querySelector("[data-order-unavailable]")?.textContent).toBe(
      "Ordering needs a venue on your account.",
    );
    fireEvent.click(review);
    expect(nav.goToStep).not.toHaveBeenCalled();
  });

  it("while venues load, the bar says so instead", () => {
    render(createElement(StatefulNoVenueStore, { nav: fakeNav({ sheet: "store" }), venueLoading: true }));
    expect(screen.getByText("Loading your venue…")).not.toBeNull();
    expect((screen.getByRole("button", { name: /Review order/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a &step=review URL with a cart but no venue lands on the Shop and drops the step", () => {
    const nav = fakeNav({ sheet: "store", step: "review", displayStepFor: () => "review" });
    render(createElement(MerchStoreSheet, { nav, venue: null, cart: { "table-tents": 2 }, onCartChange: vi.fn() }));
    expect(screen.queryByRole("heading", { name: "Review your order" })).toBeNull();
    expect(screen.queryByText("Ships to")).toBeNull();
    expect(nav.correctStep).toHaveBeenCalledWith(null);
  });

  it("with a venue, nothing changes: no reason shown, Review enabled once the cart has items", () => {
    openShop({ "table-tents": 1 });
    expect(document.querySelector("[data-order-unavailable]")).toBeNull();
    expect((screen.getByRole("button", { name: /Review order/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Join Merch store source rules", () => {
  const storeDir = join(process.cwd(), "components/owner/store");
  const sources = readdirSync(storeDir)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => ({ file: f, src: readFileSync(join(storeDir, f), "utf8") }));

  it("components hold no price literals — every price comes from the catalog", () => {
    for (const { file, src } of sources) {
      expect(src, file).not.toMatch(/\$\d/);
      expect(src, file).not.toMatch(/\d+(\.\d+)?¢/);
      expect(src, file).not.toMatch(/priceCents:\s*\d/);
    }
  });

  it("product photos are plain pre-optimized <img> (no next/image on-the-fly optimization)", () => {
    for (const { file, src } of sources) expect(src, file).not.toContain("next/image");
  });

  // Phase 4.4 (F7): the store renders inside the light OwnerSheet, an
  // `ht-light-surface`, which app/globals.css's dark form styling skips — so a
  // `!important` utility here means a scope regression is being papered over.
  // Fix the scope (tests/light-surface-css-contract.test.ts), don't add a `!`.
  it("controls need no `!important` utilities (the light surface opts out of the global form CSS)", () => {
    for (const { file, src } of sources) {
      expect(src, file).not.toMatch(/(^|[\s"'`:])![a-z][\w-]*-/m);
    }
  });
});
