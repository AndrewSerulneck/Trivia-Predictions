// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useState, type ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { OwnerMenuDrawer } from "@/components/owner/menu/OwnerMenuDrawer";
import { PartnerManual } from "@/components/owner/PartnerManual";
import { DRAWER_EXIT_MS, SHEET_EXIT_MS } from "@/components/owner/sheet/sheetMotion";

// docs/partner-dashboard-app-redesign-plan.md Phase 1: the shared overlay
// mechanics (controlled open, exit-then-unmount, Escape on the topmost only,
// close guard, focus in and back, scroll lock) and the Partner Manual running
// through them unchanged. createElement instead of JSX (*.test.ts glob).

type SheetProps = ComponentProps<typeof OwnerSheet>;

const sheetProps = (overrides: Partial<SheetProps>): SheetProps =>
  ({ open: true, onRequestClose: () => {}, title: "Schedule a live game", ...overrides }) as SheetProps;

const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');

describe("OwnerSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  it("renders nothing while closed", () => {
    render(createElement(OwnerSheet, sheetProps({ open: false }), "Body"));
    expect(dialog()).toBeNull();
  });

  it("portals a labelled modal dialog into document.body and focuses it", () => {
    const { container } = render(createElement(OwnerSheet, sheetProps({}), "Body"));
    const panel = dialog();
    expect(panel).not.toBeNull();
    expect(container.contains(panel)).toBe(false);
    expect(panel?.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Schedule a live game" })).toBe(panel);
    expect(document.activeElement).toBe(panel);
    expect(panel?.className).toContain("animate-tp-popup-sheet-up");
  });

  it("locks page scroll while mounted", () => {
    const { rerender } = render(createElement(OwnerSheet, sheetProps({}), "Body"));
    expect(document.body.classList.contains("tp-popup-open")).toBe(true);
    rerender(createElement(OwnerSheet, sheetProps({ open: false }), "Body"));
    // Still locked while sliding down…
    expect(document.body.classList.contains("tp-popup-open")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(SHEET_EXIT_MS);
    });
    expect(document.body.classList.contains("tp-popup-open")).toBe(false);
  });

  it("asks to close on Escape, the Close button and a scrim tap — never closes itself", () => {
    const onRequestClose = vi.fn();
    render(createElement(OwnerSheet, sheetProps({ onRequestClose }), "Body"));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.mouseDown(dialog()?.parentElement as HTMLElement);
    fireEvent.mouseDown(dialog() as HTMLElement); // inside the panel: ignored
    expect(onRequestClose).toHaveBeenCalledTimes(3);
    expect(dialog()).not.toBeNull();
  });

  it("closeGuard can veto a close", () => {
    const onRequestClose = vi.fn();
    const closeGuard = vi.fn(() => false);
    render(createElement(OwnerSheet, sheetProps({ onRequestClose, closeGuard }), "Body"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closeGuard).toHaveBeenCalledTimes(1);
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("plays the exit, then unmounts, returns focus and fires onExited", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const onExited = vi.fn();

    const { rerender } = render(createElement(OwnerSheet, sheetProps({ onExited }), "Body"));
    expect(document.activeElement).toBe(dialog());

    rerender(createElement(OwnerSheet, sheetProps({ open: false, onExited }), "Body"));
    expect(dialog()?.className).toContain("animate-tp-popup-sheet-down");
    expect(onExited).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SHEET_EXIT_MS);
    });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(onExited).toHaveBeenCalledTimes(1);
    opener.remove();
  });

  it("reopening mid-exit cancels the unmount", () => {
    const { rerender } = render(createElement(OwnerSheet, sheetProps({}), "Body"));
    rerender(createElement(OwnerSheet, sheetProps({ open: false }), "Body"));
    rerender(createElement(OwnerSheet, sheetProps({ open: true }), "Body"));
    act(() => {
      vi.advanceTimersByTime(SHEET_EXIT_MS * 2);
    });
    expect(dialog()?.className).toContain("animate-tp-popup-sheet-up");
  });

  it("traps Tab inside the panel", () => {
    render(
      createElement(
        OwnerSheet,
        sheetProps({ footer: createElement("button", { type: "button" }, "Next") }),
        createElement("input", { "aria-label": "Title" })
      )
    );
    const close = screen.getByRole("button", { name: "Close" });
    const next = screen.getByRole("button", { name: "Next" });
    next.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(next);
  });

  it("Escape only closes the topmost overlay", () => {
    const outerClose = vi.fn();
    const innerClose = vi.fn();
    render(
      createElement(
        "div",
        null,
        createElement(OwnerSheet, sheetProps({ onRequestClose: outerClose, title: "Outer" }), "Outer body"),
        createElement(OwnerSheet, sheetProps({ onRequestClose: innerClose, title: "Inner" }), "Inner body")
      )
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(innerClose).toHaveBeenCalledTimes(1);
    expect(outerClose).not.toHaveBeenCalled();
  });

  it("tall sheets get a grab handle and a footer slot; card sheets do not get a handle", () => {
    render(
      createElement(OwnerSheet, sheetProps({ footer: createElement("span", null, "Footer here") }), "Body")
    );
    expect(dialog()?.className).toContain("h-[92svh]");
    expect(screen.getByText("Footer here")).not.toBeNull();
    cleanup();

    render(createElement(OwnerSheet, sheetProps({ size: "card" }), "Body"));
    expect(dialog()?.className).toContain("tp-sheet-offset-screen");
    expect(dialog()?.className).toContain("max-h-[90svh]");
    expect(dialog()?.className).not.toContain("h-[92svh]");
  });
});

describe("OwnerMenuDrawer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("slides in from the left and out again before unmounting", () => {
    // `children` goes in createElement's third argument (react/no-children-prop),
    // so the props object is cast past the required `children` field.
    type DrawerProps = ComponentProps<typeof OwnerMenuDrawer>;
    const props = { open: true, onRequestClose: () => {}, label: "Menu" } as DrawerProps;
    const { rerender } = render(createElement(OwnerMenuDrawer, props, "Rows"));
    expect(screen.getByRole("dialog", { name: "Menu" }).className).toContain("animate-tp-drawer-in");
    rerender(createElement(OwnerMenuDrawer, { ...props, open: false }, "Rows"));
    expect(screen.getByRole("dialog", { name: "Menu" }).className).toContain("animate-tp-drawer-out");
    act(() => {
      vi.advanceTimersByTime(DRAWER_EXIT_MS);
    });
    expect(dialog()).toBeNull();
  });
});

describe("PartnerManual through OwnerSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("opens from its trigger, closes on Close, and hands focus back to the trigger", () => {
    render(createElement(PartnerManual));
    const trigger = screen.getByRole("button", { name: /Partner Manual/ });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    fireEvent.click(trigger);

    const panel = screen.getByRole("dialog", { name: "Partner Manual" });
    expect(panel.getAttribute("aria-labelledby")).toBe("partner-manual-title");
    expect(panel.className).toContain("tp-sheet-offset-screen");
    expect(screen.getByText("Hightop Challenge")).not.toBeNull();
    expect(screen.getByText("What is Hightop Challenge?")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(panel.className).toContain("animate-tp-popup-sheet-down");
    act(() => {
      vi.advanceTimersByTime(SHEET_EXIT_MS);
    });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("controlled mode: no trigger, opened and closed by the host", () => {
    const Host = () => {
      const [open, setOpen] = useState(false);
      return createElement(
        "div",
        null,
        createElement("button", { type: "button", onClick: () => setOpen(true) }, "Menu row"),
        createElement(PartnerManual, { open, onOpenChange: setOpen, showTrigger: false })
      );
    };
    render(createElement(Host));
    expect(screen.queryByRole("button", { name: /📖/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menu row" }));
    expect(screen.getByRole("dialog", { name: "Partner Manual" })).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(SHEET_EXIT_MS);
    });
    expect(dialog()).toBeNull();
  });
});
