// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createElement, type ComponentProps } from "react";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { AdminModalSheet } from "@/components/admin/AdminModalSheet";

// Phase 6B of docs/billing-dollar-rate-plan.md. AdminModalSheet is the shared
// chrome for BillingSection's Grant/Discount/Custom-rate modals: dialog
// semantics, Escape/backdrop dismiss, and a body-scroll lock that plain
// hand-rolled divs never had. This pins that behavior so it can't regress
// silently. No JSX (repo's vitest config only globs *.test.ts, not *.test.tsx)
// — createElement stands in for it, same as tests/admin-mobile.bottom-sheet-a11y.test.ts.

type SheetProps = ComponentProps<typeof AdminModalSheet>;

const renderSheet = (props: Partial<SheetProps> & { open: boolean; onClose: () => void }) =>
  render(
    createElement(
      AdminModalSheet,
      { titleId: "test-modal-title", ...props } as SheetProps,
      createElement("h3", { id: "test-modal-title" }, "Test modal"),
      createElement("button", { type: "button" }, "Inside button")
    )
  );

describe("AdminModalSheet a11y", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("renders nothing when closed", () => {
    const { container } = renderSheet({ open: false, onClose: () => {} });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("renders a dialog with aria-modal and aria-labelledby when open", () => {
    const { container } = renderSheet({ open: true, onClose: () => {} });
    const panel = container.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect((panel as HTMLElement).getAttribute("aria-modal")).toBe("true");
    expect((panel as HTMLElement).getAttribute("aria-labelledby")).toBe("test-modal-title");
  });

  it("calls onClose when Escape is pressed", () => {
    let closed = false;
    renderSheet({ open: true, onClose: () => { closed = true; } });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(closed).toBe(true);
  });

  it("does not call onClose for other keys", () => {
    let closed = false;
    renderSheet({ open: true, onClose: () => { closed = true; } });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(closed).toBe(false);
  });

  it("calls onClose when the backdrop is clicked", () => {
    let closed = false;
    const { container } = renderSheet({ open: true, onClose: () => { closed = true; } });
    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(closed).toBe(true);
  });

  it("does not call onClose when a click inside the panel occurs", () => {
    let closed = false;
    renderSheet({ open: true, onClose: () => { closed = true; } });
    fireEvent.click(screen.getByRole("button", { name: "Inside button" }));
    expect(closed).toBe(false);
  });

  it("locks body scroll on open and restores it on close", () => {
    document.body.style.overflow = "auto";
    const { rerender, unmount } = renderSheet({ open: true, onClose: () => {} });
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      createElement(
        AdminModalSheet,
        { open: false, onClose: () => {}, titleId: "test-modal-title" } as SheetProps,
        createElement("h3", { id: "test-modal-title" }, "Test modal")
      )
    );
    expect(document.body.style.overflow).toBe("auto");
    unmount();
  });
});
