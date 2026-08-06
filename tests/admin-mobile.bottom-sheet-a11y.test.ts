// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createElement, type ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { MobileBottomSheet } from "@/components/admin/mobile/MobileBottomSheet";

// admin-mobile Phase R2, finding 4. `aria-hidden={!open}` over mounted
// tabbable buttons is an aria-hidden-focus violation: VoiceOver/TalkBack and
// keyboard tab order could still reach controls (Grant/Discount/Revoke in
// BillingSection, the map picker in ActivateVenueFlow) while the sheet is
// visually off-screen. The fix unmounts children while closed instead of
// just hiding them. This pins that behavior so it can't regress silently.
// No JSX here (repo's vitest config only globs *.test.ts, not *.test.tsx) —
// createElement stands in for it, same as the file extension constraint the
// R1 sequencing test already worked around for hooks. `children` is omitted
// from the props object and passed as the third createElement argument
// instead (required by eslint's react/no-children-prop); the props object is
// cast to satisfy MobileBottomSheetProps, which otherwise requires `children`
// even though React fills it in from the third argument at runtime.

type SheetPropsWithoutChildren = Omit<ComponentProps<typeof MobileBottomSheet>, "children">;

describe("MobileBottomSheet a11y", () => {
  it("renders no children when closed", () => {
    render(
      createElement(
        MobileBottomSheet,
        { open: false, onClose: () => {}, title: "Test sheet" } as SheetPropsWithoutChildren as ComponentProps<
          typeof MobileBottomSheet
        >,
        createElement("button", { type: "button" }, "Revoke")
      )
    );
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
  });

  it("renders children when open", () => {
    render(
      createElement(
        MobileBottomSheet,
        { open: true, onClose: () => {}, title: "Test sheet" } as SheetPropsWithoutChildren as ComponentProps<
          typeof MobileBottomSheet
        >,
        createElement("button", { type: "button" }, "Revoke")
      )
    );
    expect(screen.getByRole("button", { name: "Revoke" })).not.toBeNull();
  });

  it("marks the closed panel inert so it cannot be tabbed into mid-transition", () => {
    const { container } = render(
      createElement(
        MobileBottomSheet,
        { open: false, onClose: () => {} } as SheetPropsWithoutChildren as ComponentProps<typeof MobileBottomSheet>,
        createElement("button", { type: "button" }, "Revoke")
      )
    );
    const panel = container.querySelector('[role="dialog"]');
    expect(panel).not.toBeNull();
    expect((panel as HTMLElement).hasAttribute("inert")).toBe(true);
  });
});
