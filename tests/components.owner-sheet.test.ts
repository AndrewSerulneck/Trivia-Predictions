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

  it("ignores an Escape something inside already used (an open Dropdown closing)", () => {
    const onRequestClose = vi.fn();
    render(createElement(OwnerSheet, sheetProps({ onRequestClose }), createElement("input", { "aria-label": "Zone" })));
    const input = screen.getByLabelText("Zone");
    const swallow = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    };
    document.addEventListener("keydown", swallow);
    fireEvent.keyDown(input, { key: "Escape" });
    document.removeEventListener("keydown", swallow);
    expect(onRequestClose).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("doesn't pull focus back if the close handed it to another overlay (Menu → Partner Manual)", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(
      createElement(
        "div",
        null,
        createElement(OwnerSheet, sheetProps({ title: "First" }), "First body"),
        createElement(OwnerSheet, sheetProps({ open: false, title: "Second" }), "Second body")
      )
    );
    rerender(
      createElement(
        "div",
        null,
        createElement(OwnerSheet, sheetProps({ open: false, title: "First" }), "First body"),
        createElement(OwnerSheet, sheetProps({ title: "Second" }), "Second body")
      )
    );
    const second = screen.getByRole("dialog", { name: "Second" });
    expect(document.activeElement).toBe(second);
    act(() => {
      vi.advanceTimersByTime(SHEET_EXIT_MS);
    });
    expect(document.activeElement).toBe(second);
    opener.remove();
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

describe("OwnerSheet scrollKey (join-merch-store-plan Phase 4.3, F6)", () => {
  // Each flow step starts at the top: a changed key scrolls the body back up.
  afterEach(() => {
    cleanup();
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  const body = () => dialog()?.querySelector<HTMLElement>(".overflow-y-auto") ?? null;
  const renderKeyed = (scrollKey: string | undefined) =>
    createElement(OwnerSheet, sheetProps({ scrollKey }), "Body");

  it("a changed scrollKey resets the body to the top", () => {
    const { rerender } = render(renderKeyed("shop"));
    const scroller = body() as HTMLElement;
    scroller.scrollTop = 480;
    rerender(renderKeyed("review"));
    expect(body()).toBe(scroller);
    expect(scroller.scrollTop).toBe(0);
  });

  it("an unchanged scrollKey leaves the scroll position alone", () => {
    const { rerender } = render(renderKeyed("shop"));
    const scroller = body() as HTMLElement;
    scroller.scrollTop = 480;
    rerender(renderKeyed("shop"));
    expect(scroller.scrollTop).toBe(480);
  });

  it("adds no markup", () => {
    render(createElement(OwnerSheet, sheetProps({ titleId: "t" }), "Body"));
    const without = dialog()?.parentElement?.outerHTML;
    cleanup();
    render(createElement(OwnerSheet, sheetProps({ titleId: "t", scrollKey: "when" }), "Body"));
    expect(dialog()?.parentElement?.outerHTML).toBe(without);
  });
});

describe("OwnerSheet tones (join-merch-store-plan Phase 2)", () => {
  // The dark tone is the Partner Manual / Schedule / Rewards look. These
  // snapshots were recorded BEFORE `tone` existed, so they pin that adding
  // the light tone left dark output byte-for-byte unchanged.
  afterEach(() => {
    cleanup();
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  const scrimHtml = () => dialog()?.parentElement?.outerHTML ?? "";

  const variants: [string, Partial<SheetProps>][] = [
    ["tall + eyebrow + footer", { eyebrow: "Hightop Challenge", footer: createElement("span", null, "Footer"), titleId: "t" }],
    ["tall, no footer", { titleId: "t" }],
    ["card + eyebrow", { size: "card", eyebrow: "Hightop Challenge", titleId: "t" }],
  ];

  for (const [name, overrides] of variants) {
    it(`dark (default) markup is pinned: ${name}`, () => {
      render(createElement(OwnerSheet, sheetProps(overrides), "Body"));
      expect(scrimHtml()).toMatchSnapshot();
    });
  }

  it('tone="dark" is the same markup as no tone', () => {
    render(createElement(OwnerSheet, sheetProps({ titleId: "t", eyebrow: "E" }), "Body"));
    const implicit = scrimHtml();
    cleanup();
    render(createElement(OwnerSheet, sheetProps({ titleId: "t", eyebrow: "E", tone: "dark" }), "Body"));
    expect(scrimHtml()).toBe(implicit);
  });

  it("light: store-paper panel, slate hairlines and text, a white Close, light native controls, dark scrim", () => {
    render(
      createElement(
        OwnerSheet,
        sheetProps({ tone: "light", eyebrow: "Hightop Challenge Store", footer: createElement("span", null, "Bar") }),
        "Body"
      )
    );
    const panel = dialog() as HTMLElement;
    expect(panel.className).toContain("bg-ht-store-paper");
    expect(panel.className).toContain("[color-scheme:light]");
    // Opts the whole panel (header, body, footer) out of globals.css's dark form CSS (Phase 4.4, F7).
    expect(panel.className.split(" ")).toContain("ht-light-surface");
    expect(panel.className).not.toContain("bg-ht-surface");
    expect(panel.className).not.toContain("border-ht-hairline");
    expect(panel.parentElement?.className).toContain("bg-slate-950/70");

    const html = panel.outerHTML;
    for (const dark of ["ht-hairline", "bg-ht-elevated", "text-ht-primary", "text-ht-cyan-300"]) {
      expect(html).not.toContain(dark);
    }
    expect(screen.getByRole("heading", { name: "Schedule a live game" }).className).toContain("!text-slate-900");
    expect(screen.getByText("Hightop Challenge Store").className).toContain("text-cyan-700");
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.className).toContain("bg-white");
    // Plain utilities, no `!`: the light surface keeps the global button border out.
    expect(close.className.split(" ")).toContain("border-slate-300");
    expect(close.className).not.toMatch(/(^|\s)!/);
    // Same 12px / 600 the dark Close renders (there via the global button rule).
    expect(close.className.split(" ")).toEqual(expect.arrayContaining(["rounded-xl", "font-semibold"]));
    expect(close.className).toContain("text-slate-700");
    expect(panel.querySelector("header")?.className).toContain("border-slate-200");
    expect(screen.getByText("Bar").parentElement?.className).toContain("border-slate-200");
    expect(panel.querySelector("span.rounded-full")?.className).toContain("bg-slate-300");
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
