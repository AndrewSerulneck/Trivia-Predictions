import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runVenueGameOpenTransition } from "@/lib/venueGameTransition";

const CARD_VIEWPORT_KEY = "tp:venue:card-viewport:v1";

type StubStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const createStorage = (): StubStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
};

let sessionStorage: StubStorage;

/**
 * A zero-sized source element makes `runVenueGameOpenTransition` bail to a plain
 * navigate *after* the snapshot decision, so the animation machinery (Web
 * Animations, DOM cloning) never runs — which is what lets this exercise the
 * real module under Vitest's node environment.
 */
const zeroRectElement = () =>
  ({
    getBoundingClientRect: () => ({ left: 40, top: 120, width: 0, height: 0 }),
  }) as unknown as HTMLElement;

beforeEach(() => {
  sessionStorage = createStorage();
  const windowStub = {
    innerWidth: 390,
    innerHeight: 844,
    sessionStorage,
    getComputedStyle: () => ({ borderRadius: "22px", borderTopLeftRadius: "22px" }),
  };
  Object.assign(globalThis, {
    window: windowStub,
    document: { body: {} },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
});

describe("runVenueGameOpenTransition card-viewport snapshot", () => {
  it("persists the source rect by default (venue-home tiles)", async () => {
    let navigated = false;
    await runVenueGameOpenTransition({
      gameKey: "bingo",
      sourceElement: zeroRectElement(),
      targetPath: "/bingo",
      navigate: () => {
        navigated = true;
      },
    });

    expect(navigated).toBe(true);
    const raw = sessionStorage.getItem(CARD_VIEWPORT_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).gameKey).toBe("bingo");
  });

  it("leaves the existing snapshot alone when persistCardSnapshot is false", async () => {
    // Stand in for the snapshot the venue-home card wrote earlier.
    const existing = JSON.stringify({
      gameKey: "bingo",
      leftRatio: 0.05,
      topRatio: 0.6,
      widthRatio: 0.42,
      heightRatio: 0.18,
      borderRadiusPx: 22,
      capturedAt: 1,
    });
    sessionStorage.setItem(CARD_VIEWPORT_KEY, existing);

    let navigated = false;
    await runVenueGameOpenTransition({
      gameKey: "bingo",
      sourceElement: zeroRectElement(),
      targetPath: "/bingo",
      navigate: () => {
        navigated = true;
      },
      persistCardSnapshot: false,
    });

    expect(navigated).toBe(true);
    expect(sessionStorage.getItem(CARD_VIEWPORT_KEY)).toBe(existing);
  });
});
