// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { AccountDrawer } from "@/components/navigation/AccountDrawer";
import {
  handleNativeBackPress,
  minimizeNativeApp,
  resetNativeBackHandlersForTest,
  useNativeBackHandler,
} from "@/components/navigation/nativeBackButton";

// The player account drawer shell exists once (reward-minimum-players-plan Phase 6):
// the venue hub and the in-game AccountMenu both render it. createElement, not JSX (*.test.ts glob).

const enterApp = () => {
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    isPluginAvailable: (name: string) => name === "App",
    nativePromise: vi.fn(async () => ({})),
  };
};

const lockOwners = () =>
  (window as unknown as { __tpScrollLockState?: { owners: Record<string, string> } }).__tpScrollLockState?.owners;

const Root = ({ onClose, open }: { onClose: () => void; open: boolean }) => {
  useNativeBackHandler("exit", minimizeNativeApp);
  // eslint-disable-next-line react/no-children-prop -- the *.test.ts glob rules out JSX
  return createElement(AccountDrawer, { open, onClose, scrollLockId: "test-drawer", children: createElement("p", null, "inside") });
};

beforeEach(() => {
  resetNativeBackHandlersForTest();
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  delete (window as unknown as { __tpScrollLockState?: unknown }).__tpScrollLockState;
});

describe("AccountDrawer", () => {
  it("scrim and Close both close it", () => {
    const onClose = vi.fn();
    render(createElement(Root, { open: true, onClose }));
    fireEvent.click(screen.getByLabelText("Close navigation menu"));
    fireEvent.click(screen.getByRole("button", { name: "Close", hidden: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("marks the page scroll-locked only while open", () => {
    const { container, rerender } = render(createElement(Root, { open: true, onClose: vi.fn() }));
    expect(container.querySelector("[data-tp-scroll-lock='active']")).not.toBeNull();
    expect(lockOwners()).toEqual({ "test-drawer": "modal" });
    rerender(createElement(Root, { open: false, onClose: vi.fn() }));
    expect(container.querySelector("[data-tp-scroll-lock='active']")).toBeNull();
    expect(lockOwners()).toEqual({});
  });

  it("is hidden from assistive tech and inert to taps while closed", () => {
    const { container } = render(createElement(Root, { open: false, onClose: vi.fn() }));
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("aria-hidden")).toBe("true");
    expect(wrapper.className).toContain("pointer-events-none");
  });

  it("in the app, Android Back closes the open drawer instead of the screen's exit", () => {
    enterApp();
    const onClose = vi.fn();
    const goBack = vi.fn();
    const minimize = vi.fn();
    render(createElement(Root, { open: true, onClose }));
    handleNativeBackPress(true, { goBack, minimize });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(goBack).not.toHaveBeenCalled();
    expect(minimize).not.toHaveBeenCalled();
  });
});

describe("both player menus use the shared drawer", () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

  it.each(["components/ui/AccountMenu.tsx", "components/venue/VenueHubClient.tsx"])(
    "%s renders AccountDrawer and keeps no drawer shell of its own",
    (file) => {
      const source = read(file);
      expect(source).toContain("<AccountDrawer");
      expect(source).not.toContain("Close navigation menu");
      expect(source).not.toContain("setScrollLock(");
    },
  );
});
