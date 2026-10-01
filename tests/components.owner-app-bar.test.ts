// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DRAWER_EXIT_MS } from "@/components/owner/sheet/sheetMotion";
import { OWNER_MENU_HINT_KEY, resetMenuHintDecision } from "@/lib/ownerMenuHint";
import { SHEET_DEPTH_KEY } from "@/lib/ownerSheetParams";

// Code-review fixes (docs/partner-dashboard-app-redesign-plan.md, final review):
// the ☰ hint is only spent where the logo is shown, a menu link closes the
// drawer BEFORE navigating (so its scroll lock is released on this page), and
// Menu → Partner Manual leaves focus in the manual. createElement, not JSX
// (*.test.ts glob).

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/owner/dashboard",
}));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/authFastPath", () => ({ hardClearAuthAndCache: vi.fn() }));

const { OwnerAppBar } = await import("@/components/owner/OwnerAppBar");

// `children` is required, but lint wants it passed positionally (react/no-children-prop).
type BarProps = ComponentProps<typeof OwnerAppBar>;
const bar = (props: Partial<BarProps>, title: string) => createElement(OwnerAppBar, props as BarProps, title);

const drawer = () => screen.queryByRole("dialog", { name: "Menu" });

describe("OwnerAppBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    resetMenuHintDecision();
    push.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  it("a sub-page with its own Back never spends the first-visit ☰ hint", () => {
    render(bar({ leading: createElement("span", null, "Back") }, "Billing"));
    expect(window.localStorage.getItem(OWNER_MENU_HINT_KEY)).toBeNull();
    cleanup();

    const { container } = render(bar({}, "Dashboard"));
    expect(container.querySelector("[data-menu-hint-pulse]")).not.toBeNull();
    expect(window.localStorage.getItem(OWNER_MENU_HINT_KEY)).toBe("1");
  });

  it("a menu link closes the drawer first, then navigates", () => {
    render(bar({}, "Dashboard"));
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(drawer()).not.toBeNull();

    fireEvent.click(screen.getByRole("link", { name: /Billing/ }));
    expect(push).not.toHaveBeenCalled();
    expect(drawer()?.className).toContain("animate-tp-drawer-out");

    act(() => {
      vi.advanceTimersByTime(DRAWER_EXIT_MS);
    });
    expect(drawer()).toBeNull();
    expect(document.body.classList.contains("tp-popup-open")).toBe(false);
    expect(push).toHaveBeenCalledWith("/owner/billing");
  });

  it("Menu → Partner Manual: the drawer's exit leaves focus in the manual", () => {
    render(bar({}, "Dashboard"));
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("button", { name: /Partner Manual/ }));
    const manual = screen.getByRole("dialog", { name: /Partner Manual/ });
    expect(manual.contains(document.activeElement)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(DRAWER_EXIT_MS);
    });
    expect(drawer()).toBeNull();
    expect(manual.contains(document.activeElement)).toBe(true);
  });

  it("Order Join Merch closes the drawer first, then pushes ?sheet=store with a sheet depth (no router.push)", () => {
    window.history.replaceState(null, "", "/owner/dashboard?venueId=v1");
    render(bar({}, "Dashboard"));
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const row = screen.getByRole("button", { name: /Order Join Merch/ });
    expect(row.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(row);
    expect(window.location.search).toBe("?venueId=v1");
    expect(drawer()?.className).toContain("animate-tp-drawer-out");

    act(() => {
      vi.advanceTimersByTime(DRAWER_EXIT_MS);
    });
    expect(drawer()).toBeNull();
    expect(document.body.classList.contains("tp-popup-open")).toBe(false);
    expect(window.location.pathname).toBe("/owner/dashboard");
    expect(window.location.search).toBe("?venueId=v1&sheet=store");
    expect((window.history.state as Record<string, unknown>)[SHEET_DEPTH_KEY]).toBe(1);
    expect(push).not.toHaveBeenCalled();
    window.history.replaceState(null, "", "/");
  });

  it("reopening the menu mid-exit abandons the pending store open", () => {
    window.history.replaceState(null, "", "/owner/dashboard");
    render(bar({}, "Dashboard"));
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("button", { name: /Order Join Merch/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    act(() => {
      vi.advanceTimersByTime(DRAWER_EXIT_MS);
    });
    expect(window.location.search).toBe("");
    window.history.replaceState(null, "", "/");
  });

  it("off the dashboard, a sheet row does nothing — never a navigation to a sheet URL (join-merch Phase 4.1, F5)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    window.history.replaceState(null, "", "/owner/somewhere");
    const before = window.history.length;
    render(bar({}, "Elsewhere"));
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("button", { name: /Order Join Merch/ }));
    act(() => {
      vi.advanceTimersByTime(DRAWER_EXIT_MS);
    });
    expect(push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/owner/somewhere");
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(before);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    window.history.replaceState(null, "", "/");
  });
});
