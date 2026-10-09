// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import {
  handleNativeBackPress,
  minimizeNativeApp,
  resetNativeBackHandlersForTest,
  useNativeBackHandler,
} from "@/components/navigation/nativeBackButton";
import { saveVenueId } from "@/lib/storage";

// docs/native-app-review-fixes-plan.md Phase R1 — Android Back inside the app:
//   A. a player popup closes before the screen's Back runs;
//   B. the screen's Back REPLACES history (a tap still pushes, so the website is
//      unchanged), and the venue hub — the signed-in player's root — minimises.
// createElement, not JSX (*.test.ts glob).

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const { ExitBackButton } = await import("@/components/navigation/ExitBackButton");

type FakeBridge = {
  isNativePlatform: () => boolean;
  isPluginAvailable: (name: string) => boolean;
  nativePromise: ReturnType<typeof vi.fn>;
};

const enterApp = (): FakeBridge => {
  const bridge: FakeBridge = {
    isNativePlatform: () => true,
    isPluginAvailable: (name) => name === "App",
    nativePromise: vi.fn(async () => ({})),
  };
  (window as unknown as { Capacitor?: FakeBridge }).Capacitor = bridge;
  return bridge;
};

const leaveApp = () => {
  delete (window as unknown as { Capacitor?: FakeBridge }).Capacitor;
};

const fallbacks = () => ({ goBack: vi.fn(), minimize: vi.fn() });

/** A player popup, wired exactly the way the audited components are. */
const Popup = ({ open, onClose }: { open: boolean; onClose: () => void }): ReactElement | null => {
  useNativeBackHandler("overlay", open ? onClose : null);
  return open ? createElement("div", { role: "dialog" }, "popup") : null;
};

/** The venue hub's registration (components/venue/VenueHubClient.tsx). */
const RootScreen = (): ReactElement => {
  useNativeBackHandler("exit", minimizeNativeApp);
  return createElement("main", null, "venue hub");
};

beforeEach(() => {
  resetNativeBackHandlersForTest();
  push.mockReset();
  replace.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  leaveApp();
  vi.useRealTimers();
});

describe("R1 — Android Back in the app", () => {
  it("an open player popup beats the screen's Back; once it closes, Back runs the exit", () => {
    enterApp();
    const close = vi.fn();
    const view = render(
      createElement("div", null, createElement(ExitBackButton, { href: "/faqs" }), createElement(Popup, { open: true, onClose: close })),
    );
    const f = fallbacks();

    handleNativeBackPress(true, f);
    expect(close).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    view.rerender(
      createElement("div", null, createElement(ExitBackButton, { href: "/faqs" }), createElement(Popup, { open: false, onClose: close })),
    );
    handleNativeBackPress(true, f);
    expect(close).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/faqs");
    expect(f.goBack).not.toHaveBeenCalled();
  });

  it("Back from the exit handler replaces, never pushes (fresh-history fallback)", () => {
    enterApp();
    expect(window.history.length).toBe(1);
    render(createElement(ExitBackButton, { href: "/faqs" }));
    handleNativeBackPress(true, fallbacks());
    expect(replace).toHaveBeenCalledWith("/faqs");
    expect(push).not.toHaveBeenCalled();
  });

  it("Back replaces on the preferHref and venue-home fallbacks too", async () => {
    enterApp();
    render(createElement(ExitBackButton, { href: "/active-games", preferHref: true }));
    handleNativeBackPress(true, fallbacks());
    expect(replace).toHaveBeenCalledWith("/active-games");
    cleanup();
    resetNativeBackHandlersForTest();

    saveVenueId("venue-abc");
    render(createElement(ExitBackButton, { venueHomeFallback: true }));
    await act(async () => {
      handleNativeBackPress(true, fallbacks());
    });
    expect(replace).toHaveBeenLastCalledWith("/venue/venue-abc");
    expect(push).not.toHaveBeenCalled();
  });

  it("a TAP on Back still pushes, in the app and on the website", () => {
    enterApp();
    render(createElement(ExitBackButton, { href: "/faqs" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(push).toHaveBeenCalledWith("/faqs");
    expect(replace).not.toHaveBeenCalled();
    cleanup();
    leaveApp();
    push.mockReset();

    render(createElement(ExitBackButton, { href: "/faqs" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(push).toHaveBeenCalledWith("/faqs");
    expect(replace).not.toHaveBeenCalled();
  });

  it("website: nothing registers, so Back has no on-screen handler", () => {
    render(createElement("div", null, createElement(ExitBackButton, { href: "/faqs" }), createElement(RootScreen)));
    const f = fallbacks();
    handleNativeBackPress(true, f);
    expect(f.goBack).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("the venue hub minimises the app — no history.back() into the game just left", () => {
    const bridge = enterApp();
    render(createElement(RootScreen));
    const f = fallbacks();
    handleNativeBackPress(true, f);
    expect(bridge.nativePromise).toHaveBeenCalledWith("App", "minimizeApp", {});
    expect(f.goBack).not.toHaveBeenCalled();
    expect(f.minimize).not.toHaveBeenCalled();
  });

  it("the venue hub's popups still close before it minimises", () => {
    const bridge = enterApp();
    const close = vi.fn();
    render(createElement("div", null, createElement(RootScreen), createElement(Popup, { open: true, onClose: close })));
    handleNativeBackPress(true, fallbacks());
    expect(close).toHaveBeenCalledTimes(1);
    expect(bridge.nativePromise).not.toHaveBeenCalled();
  });

  it("minimizeNativeApp is a silent no-op on the website", async () => {
    expect(() => minimizeNativeApp()).not.toThrow();
    await Promise.resolve();
  });
});

// Static: every audited player popup registers its own close with Back
// (docs/native-app-review-fixes-plan.md R1 audit). A new popup should join this list.
describe("R1 — the audited popups are wired", () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

  const OVERLAYS: Array<[file: string, registration: string]> = [
    ["components/venue/VenueHubClient.tsx", 'useNativeBackHandler("overlay", isMenuOpen ? () => setIsMenuOpen(false) : null)'],
    ["components/venue/VenueHubClient.tsx", 'useNativeBackHandler("overlay", selectedChallengeDetail ? () => setSelectedChallengeId(null) : null)'],
    ["components/venue/CategoryBlitzOnboardingOverlay.tsx", 'useNativeBackHandler("overlay", open ?'],
    ["components/ui/AccountMenu.tsx", 'useNativeBackHandler("overlay", isMenuOpen ? () => setIsMenuOpen(false) : null)'],
    ["components/ui/AccountMenu.tsx", 'useNativeBackHandler("overlay", isUsernameModalOpen ?'],
    ["components/social-share/StoryCaptureModal.tsx", 'useNativeBackHandler("overlay", isOpen ? closeModal : null)'],
    ["components/social-share/ShareActionsSheet.tsx", 'useNativeBackHandler("overlay", onClose ?? null)'],
    ["components/prizes/PrizeWalletPanel.tsx", 'useNativeBackHandler("overlay", onClose)'],
    ["components/bingo/CreateBoardSheet.tsx", 'useNativeBackHandler("overlay", step === "sport" ? requestClose : handleStepBack)'],
    ["components/bingo/SportsBingoSelectBoard.tsx", 'useNativeBackHandler("overlay", preview && isPreviewExpanded ?'],
    ["components/bingo/SportsBingoHome.tsx", 'useNativeBackHandler("overlay", expandedActiveCard &&'],
    ["components/bingo/SportsBingoHome.tsx", 'useNativeBackHandler("overlay", expandedFinalCard &&'],
    ["components/ui/DateCalendarPopover.tsx", 'useNativeBackHandler("overlay", isOpen ? closeSheet : null)'],
    ["components/ui/PopupAds.tsx", 'useNativeBackHandler("overlay", popup?.open ? beginClose : null)'],
    ["components/ui/Dropdown.tsx", 'useNativeBackHandler("overlay", isOpen ?'],
    ["components/leaderboard/LeaderboardTable.tsx", 'useNativeBackHandler("overlay", isTimeframeMenuOpen'],
    ["app/trivia/live/page.tsx", 'useNativeBackHandler("overlay", popupAd ?'],
    ["components/join/JoinFlow.tsx", 'useNativeBackHandler("overlay", onSkip)'],
  ];

  it.each(OVERLAYS)("%s registers its close", (file, registration) => {
    expect(read(file)).toContain(registration);
  });

  it("the venue hub is the root: Back minimises", () => {
    expect(read("components/venue/VenueHubClient.tsx")).toContain('useNativeBackHandler("exit", minimizeNativeApp)');
  });

  it("the update-required screen blocks Back from navigating behind it", () => {
    expect(read("components/native/NativeAppRuntimeImpl.tsx")).toContain(
      'useNativeBackHandler("overlay", update.required ? minimizeNativeApp : null)',
    );
  });

  it("ExitBackButton: native Back replaces, the tap does not", () => {
    const source = read("components/navigation/ExitBackButton.tsx");
    expect(source).toContain("handleExit({ replace: true })");
    expect(source).toContain("onClick={() => { triggerBackHaptic(); void handleExit(); }}");
  });

  it("no player popup calls the bridge directly — minimise goes through nativeBackButton.ts", () => {
    expect(read("components/venue/VenueHubClient.tsx")).not.toContain("minimizeApp");
    expect(read("components/native/NativeAppRuntimeImpl.tsx")).not.toContain('"minimizeApp"');
  });
});
