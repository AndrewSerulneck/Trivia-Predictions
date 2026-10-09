// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { haptic } from "@/lib/haptics";
import type { ChallengeCampaignCard } from "@/components/venue/venueHubShared";

// docs/native-app-review-fixes-plan.md Phase R3: haptic() is the one buzz function (native plugin in the
// app, navigator.vibrate on the website), and the Rewards "prize won" buzz needs a SUCCESSFUL baseline.

const playHapticMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/nativeHaptics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nativeHaptics")>("@/lib/nativeHaptics");
  return { ...actual, playHaptic: playHapticMock };
});

import { VenueChallengesPanel } from "@/components/venue/VenueChallengesPanel";

const stubApp = (plugins: string[]) => {
  (window as unknown as Record<string, unknown>).Capacitor = {
    isNativePlatform: () => true,
    isPluginAvailable: (n: string) => plugins.includes(n),
    nativePromise: vi.fn().mockResolvedValue({}),
  };
  Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla HightopChallengeApp/1.0.0 (ios)", configurable: true });
};

const vibrate = vi.fn();
beforeEach(() => {
  playHapticMock.mockReset();
  vibrate.mockReset();
  Object.defineProperty(window.navigator, "vibrate", { value: vibrate, configurable: true, writable: true });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).Capacitor;
  Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 Safari", configurable: true });
});

describe("haptic()", () => {
  it("routes to the native plugin and skips vibrate when the app has Haptics", () => {
    stubApp(["Haptics"]);
    haptic("selection");
    haptic("commit");
    haptic("success");
    haptic("warning");
    expect(playHapticMock.mock.calls.map((c) => c[0])).toEqual(["tap", "tap", "success", "warning"]);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("keeps navigator.vibrate on the website and in an old app build", () => {
    haptic("success");
    stubApp([]);
    haptic("commit");
    expect(playHapticMock).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenNthCalledWith(1, [14, 35, 14]);
    expect(vibrate).toHaveBeenNthCalledWith(2, 22);
  });
});

describe("one buzz per moment", () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");
  it("nothing outside lib/nativeHaptics.ts calls the Haptics plugin", () => {
    for (const f of ["lib/haptics.ts", "components/animations/AnimationTriggerProvider.tsx"]) {
      expect(read(f)).not.toMatch(/callNative\(/);
    }
  });
  it("audited: no function fires haptic() for the moment an animation haptic covers", () => {
    // Callers of haptic() are tap/submit/claim moments. The animations in HAPTIC_BY_ANIMATION fire later,
    // from results or live events, so each moment buzzes once. Re-audit when one is added to either side.
    const animationSites = ["components/trivia/TriviaGame.tsx", "components/bingo/SportsBingoHome.tsx", "components/fantasy/FantasyHome.tsx"];
    for (const f of animationSites) {
      const src = read(f);
      for (const m of src.matchAll(/haptic\("[a-z]+"\);?[^\n]*\n(?:[^\n]*\n){0,3}?[^\n]*triggerAnimation\(/g)) {
        throw new Error(`${f}: haptic() directly next to triggerAnimation(): ${m[0]}`);
      }
    }
  });
});

const card = (id: string, viewerWon: boolean): ChallengeCampaignCard => ({ id, name: "Live Trivia Challenge", viewerWon } as unknown as ChallengeCampaignCard);

type Props = Partial<Parameters<typeof VenueChallengesPanel>[0]>;
const panel = (props: Props) =>
  createElement(VenueChallengesPanel, {
    contentReady: true,
    isChallengesLoading: false,
    challengeCards: [],
    currentUserId: "u1",
    pendingChallengeRedeemId: null,
    challengesError: "",
    hasLoadedChallenges: true,
    onSelectChallenge: () => undefined,
    onGoToChallengeRedeem: () => undefined,
    onRetryChallenges: () => undefined,
    ...props,
  });

describe("Rewards panel prize-won buzz", () => {
  it("stays quiet when the first load failed and a refresh returns an old win", () => {
    const { rerender } = render(panel({ hasLoadedChallenges: false, challengesError: "Offline: challenges unavailable." }));
    rerender(panel({ hasLoadedChallenges: false, challengesError: "" })); // retry starts, error cleared
    rerender(panel({ hasLoadedChallenges: true, challengeCards: [card("a", true)] }));
    expect(playHapticMock).not.toHaveBeenCalled();
  });

  it("buzzes for a genuinely new win after a good baseline, once", () => {
    const { rerender } = render(panel({ challengeCards: [card("a", false)] }));
    rerender(panel({ challengeCards: [card("a", true)] }));
    expect(playHapticMock).toHaveBeenCalledTimes(1);
    expect(playHapticMock).toHaveBeenCalledWith("celebrate");
    rerender(panel({ challengeCards: [card("a", true)] }));
    expect(playHapticMock).toHaveBeenCalledTimes(1);
  });

  it("does not treat a failed refresh as a baseline reset", () => {
    const { rerender } = render(panel({ challengeCards: [card("a", true)] }));
    rerender(panel({ challengeCards: [card("a", true)], challengesError: "Offline" }));
    rerender(panel({ challengeCards: [card("a", true)] }));
    expect(playHapticMock).not.toHaveBeenCalled();
  });
});
