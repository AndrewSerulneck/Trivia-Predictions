import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasSeenTutorialRecently,
  markTutorialSeen,
  TUTORIAL_REPEAT_AFTER_MS,
  TUTORIAL_SKIP_ATTRIBUTE,
  tutorialSeenStorageKey,
  tutorialSkipScript,
} from "@/lib/gameOnboarding";

// Andrew, 2026-10-16: a game's tutorial cards show at most once every 24 hours,
// counted from when the player FINISHED the cards (Q1), per game, per browser.

const read = (relativePath: string): string => readFileSync(path.resolve(__dirname, "..", relativePath), "utf8");

describe("tutorial cards once every 24 hours", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() {
        return store.size;
      },
      key: (index: number) => [...store.keys()][index] ?? null,
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the cards when they have never been seen", () => {
    expect(hasSeenTutorialRecently("category-blitz")).toBe(false);
  });

  it("hides them for 24 hours after they were finished, then shows them again", () => {
    const shownAt = 1_800_000_000_000;
    markTutorialSeen("category-blitz", shownAt);
    expect(hasSeenTutorialRecently("category-blitz", shownAt + 1)).toBe(true);
    expect(hasSeenTutorialRecently("category-blitz", shownAt + TUTORIAL_REPEAT_AFTER_MS - 1)).toBe(true);
    expect(hasSeenTutorialRecently("category-blitz", shownAt + TUTORIAL_REPEAT_AFTER_MS)).toBe(false);
  });

  it("tracks each game separately", () => {
    const shownAt = 1_800_000_000_000;
    markTutorialSeen("bingo", shownAt);
    expect(hasSeenTutorialRecently("bingo", shownAt + 1)).toBe(true);
    expect(hasSeenTutorialRecently("pickem", shownAt + 1)).toBe(false);
  });

  it("does not hide the cards forever when the stored time is in the future", () => {
    const shownAt = 1_800_000_000_000;
    markTutorialSeen("fantasy", shownAt);
    expect(hasSeenTutorialRecently("fantasy", shownAt - 60_000)).toBe(false);
  });

  it("removes the old per-venue keys when it records a showing, and nothing else", () => {
    store.set("tp_onboarding_bingo_venue-a", "1");
    store.set("tp_onboarding_category-blitz_venue-b", "1");
    store.set("tp_user_id", "player-1");
    markTutorialSeen("bingo", 1_800_000_000_000);
    expect([...store.keys()].sort()).toEqual(["tp_tutorial_seen_bingo", "tp_user_id"]);
  });

  it("the pre-paint script agrees with hasSeenTutorialRecently", () => {
    const shownAt = 1_800_000_000_000;
    const cases: Array<{ stored: string | null; now: number }> = [
      { stored: null, now: shownAt },
      { stored: String(shownAt), now: shownAt + 1 },
      { stored: String(shownAt), now: shownAt + TUTORIAL_REPEAT_AFTER_MS - 1 },
      { stored: String(shownAt), now: shownAt + TUTORIAL_REPEAT_AFTER_MS },
      { stored: String(shownAt), now: shownAt - 60_000 },
      { stored: "not-a-number", now: shownAt },
      { stored: "", now: shownAt },
    ];
    for (const { stored, now } of cases) {
      store.clear();
      if (stored !== null) store.set(tutorialSeenStorageKey("pickem"), stored);
      const attributes = new Map<string, string>();
      const fakeDocument = {
        currentScript: { parentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } },
      };
      new Function("document", "localStorage", "Date", tutorialSkipScript("pickem"))(fakeDocument, localStorage, {
        now: () => now,
      });
      expect(attributes.has(TUTORIAL_SKIP_ATTRIBUTE)).toBe(hasSeenTutorialRecently("pickem", now));
    }
  });

  it("the pre-paint script swallows storage errors", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() =>
      new Function("document", "localStorage", tutorialSkipScript("pickem"))(
        { currentScript: { parentElement: { setAttribute: () => undefined } } },
        blocked
      )
    ).not.toThrow();
  });

  it("shows the cards when storage is unavailable or holds junk", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => markTutorialSeen("bingo")).not.toThrow();
    expect(hasSeenTutorialRecently("bingo")).toBe(false);

    vi.stubGlobal("localStorage", { getItem: () => "not-a-number", setItem: () => undefined });
    expect(hasSeenTutorialRecently("bingo")).toBe(false);
  });
});

describe("every tutorial host follows the rule", () => {
  it("venue home skips the Category Blitz overlay when seen recently, and records a showing only on Join", () => {
    const source = read("components/venue/VenueHubClient.tsx");
    expect(source).toContain('hasSeenTutorialRecently("category-blitz")');
    expect(source.match(/markTutorialSeen\(/g)).toHaveLength(1);
    const join = source.slice(source.indexOf("const joinCategoryBlitzFromOnboarding"));
    expect(join.slice(0, join.indexOf("}, [")).includes('markTutorialSeen("category-blitz")')).toBe(true);
  });

  it("the shared game landing (Bingo, Pick 'Em, Fantasy) skips its cards when seen recently", () => {
    const source = read("components/venue/GameLandingExperience.tsx");
    expect(source).toContain("hasSeenTutorialRecently(gameKey)");
    expect(source).toContain("markTutorialSeen(gameKey)");
    // The skip is unconditional now — no opt-in prop a page could forget to pass.
    expect(source).not.toContain("skipOnboardingIfRecent");
  });

  it("only those two hosts record a showing — playing a game never restarts the clock", () => {
    for (const file of [
      "components/category-blitz/CategoryBlitzPlayShell.tsx",
      "components/venue/CategoryBlitzOnboardingOverlay.tsx",
    ]) {
      expect(read(file)).not.toContain("markTutorialSeen(");
    }

    const allowed = new Set(["components/venue/GameLandingExperience.tsx", "components/venue/VenueHubClient.tsx"]);
    const root = path.resolve(__dirname, "..");
    const callers: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (/\.tsx?$/.test(entry) && readFileSync(full, "utf8").includes("markTutorialSeen(")) {
          callers.push(path.relative(root, full).split(path.sep).join("/"));
        }
      }
    };
    walk(path.join(root, "app"));
    walk(path.join(root, "components"));
    expect(callers.sort()).toEqual([...allowed].sort());
  });
});
