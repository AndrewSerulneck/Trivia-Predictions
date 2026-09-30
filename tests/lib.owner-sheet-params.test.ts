import { describe, expect, it } from "vitest";
import {
  buildSheetSearch,
  closeSheet,
  nextStep,
  nextStepHref,
  normalizeLandedSheet,
  parseSheetParam,
  parseStepParam,
  previousStep,
  pushSheet,
  pushStep,
  readSheetDepth,
  replaceStep,
  resolveStep,
  SHEET_DEPTH_KEY,
  stepBack,
  stepDirection,
  type SheetHistory,
  type SheetLocation,
} from "@/lib/ownerSheetParams";

// docs/partner-dashboard-app-redesign-plan.md Phase 1: the `?sheet=&step=`
// contract every later phase builds on.

const SCHEDULE_STEPS = ["game", "when", "repeat", "review"] as const;

describe("parseSheetParam", () => {
  it("accepts the two known sheets", () => {
    expect(parseSheetParam("schedule")).toBe("schedule");
    expect(parseSheetParam("rewards")).toBe("rewards");
  });

  it("rejects anything else", () => {
    for (const raw of [null, undefined, "", "Schedule", "manual", "schedule ", "billing", "__proto__"]) {
      expect(parseSheetParam(raw)).toBeNull();
    }
  });
});

describe("parseStepParam", () => {
  it("accepts short lowercase slugs", () => {
    expect(parseStepParam("when")).toBe("when");
    expect(parseStepParam("review-2")).toBe("review-2");
  });

  it("rejects malformed values", () => {
    for (const raw of [null, "", "When", "2when", "<script>", "a".repeat(33), "when?x=1", "-when"]) {
      expect(parseStepParam(raw)).toBeNull();
    }
  });
});

describe("resolveStep", () => {
  it("returns a valid active step as-is", () => {
    expect(resolveStep("repeat", SCHEDULE_STEPS)).toBe("repeat");
  });

  it("falls back to the first active step for missing / malformed / unknown values", () => {
    expect(resolveStep(null, SCHEDULE_STEPS)).toBe("game");
    expect(resolveStep("Nope!", SCHEDULE_STEPS)).toBe("game");
    expect(resolveStep("billing", SCHEDULE_STEPS)).toBe("game");
  });

  it("treats a SKIPPED step as unknown (one game option drops 'game')", () => {
    const active = ["when", "repeat", "review"] as const;
    expect(resolveStep("game", active)).toBe("when");
  });

  it("accepts extra, non-linear screens", () => {
    expect(resolveStep("history", SCHEDULE_STEPS, ["history"] as const)).toBe("history");
  });

  it("returns null for an empty flow", () => {
    expect(resolveStep("when", [] as string[])).toBeNull();
  });
});

describe("step ordering", () => {
  it("walks forward and back", () => {
    expect(nextStep(SCHEDULE_STEPS, "game")).toBe("when");
    expect(nextStep(SCHEDULE_STEPS, "review")).toBeNull();
    expect(previousStep(SCHEDULE_STEPS, "when")).toBe("game");
    expect(previousStep(SCHEDULE_STEPS, "game")).toBeNull();
  });

  it("respects skipped steps (a non-Live-Trivia game drops 'repeat')", () => {
    const active = ["game", "when", "review"] as const;
    expect(nextStep(active, "when")).toBe("review");
    expect(previousStep(active, "review")).toBe("when");
  });

  it("derives direction from order", () => {
    expect(stepDirection(SCHEDULE_STEPS, "game", "when")).toBe(1);
    expect(stepDirection(SCHEDULE_STEPS, "review", "when")).toBe(-1);
    expect(stepDirection(SCHEDULE_STEPS, "when", "when")).toBe(0);
  });

  it("treats a step outside the list as furthest along", () => {
    const steps = ["list", "detail"] as string[];
    expect(stepDirection(steps, "list", "history")).toBe(1);
    expect(stepDirection(steps, "history", "list")).toBe(-1);
  });
});

describe("buildSheetSearch / hrefs", () => {
  it("adds sheet and step while keeping unrelated params", () => {
    expect(buildSheetSearch("?venueId=v1", { sheet: "schedule", step: "when" })).toBe(
      "?venueId=v1&sheet=schedule&step=when"
    );
  });

  it("replaces an existing sheet/step rather than duplicating", () => {
    expect(buildSheetSearch("sheet=rewards&step=terms&x=1", { sheet: "schedule" })).toBe("?x=1&sheet=schedule");
  });

  it("drops a malformed step", () => {
    expect(buildSheetSearch("", { sheet: "schedule", step: "Bad Step" })).toBe("?sheet=schedule");
  });

  it("closing removes both params and returns '' when nothing is left", () => {
    expect(buildSheetSearch("?sheet=schedule&step=when", null)).toBe("");
    expect(buildSheetSearch("?sheet=schedule&x=1", null)).toBe("?x=1");
  });

  it("builds a step href", () => {
    expect(nextStepHref("/owner/dashboard", "", "rewards", "prize")).toBe("/owner/dashboard?sheet=rewards&step=prize");
  });
});

// ─── History driver ───────────────────────────────────────────────────────

type Entry = { state: unknown; url: string };

/** A minimal browser history: entries + index, `go` applied synchronously. */
const fakeBrowser = (initialUrl: string, initialState: unknown = null) => {
  const entries: Entry[] = [{ state: initialState, url: initialUrl }];
  let index = 0;
  const current = () => entries[index];
  const history: SheetHistory = {
    get state() {
      return current().state;
    },
    pushState: (data, _unused, url) => {
      entries.splice(index + 1);
      entries.push({ state: data, url });
      index = entries.length - 1;
    },
    replaceState: (data, _unused, url) => {
      entries[index] = { state: data, url };
    },
    go: (delta) => {
      index = Math.min(Math.max(index + delta, 0), entries.length - 1);
    },
  };
  const location = (): SheetLocation => {
    const url = new URL(current().url, "https://example.test");
    return { pathname: url.pathname, search: url.search, hash: url.hash };
  };
  return { history, location, url: () => current().url, entries: () => entries.map((entry) => entry.url) };
};

describe("readSheetDepth", () => {
  it("reads only positive integers", () => {
    expect(readSheetDepth({ [SHEET_DEPTH_KEY]: 2 })).toBe(2);
    for (const state of [null, undefined, "x", {}, { [SHEET_DEPTH_KEY]: 0 }, { [SHEET_DEPTH_KEY]: 1.5 }, { [SHEET_DEPTH_KEY]: "2" }]) {
      expect(readSheetDepth(state)).toBe(0);
    }
  });

  it("keeps Next.js's own keys alongside ours", () => {
    expect(readSheetDepth({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [], [SHEET_DEPTH_KEY]: 3 })).toBe(3);
  });
});

describe("history driver", () => {
  it("open → steps → close pops every entry the sheet pushed", () => {
    const browser = fakeBrowser("/owner/dashboard");
    pushSheet(browser.history, browser.location(), "schedule");
    pushStep(browser.history, browser.location(), "schedule", "when");
    pushStep(browser.history, browser.location(), "schedule", "review");
    expect(browser.url()).toBe("/owner/dashboard?sheet=schedule&step=review");
    expect(readSheetDepth(browser.history.state)).toBe(3);

    closeSheet(browser.history, browser.location());
    expect(browser.url()).toBe("/owner/dashboard");
  });

  it("the phone's Back (go -1) from a step lands on the previous step", () => {
    const browser = fakeBrowser("/owner/dashboard");
    pushSheet(browser.history, browser.location(), "schedule", "when");
    pushStep(browser.history, browser.location(), "schedule", "repeat");
    browser.history.go(-1);
    expect(browser.url()).toBe("/owner/dashboard?sheet=schedule&step=when");
    browser.history.go(-1);
    expect(browser.url()).toBe("/owner/dashboard");
  });

  it("in-app StepBack pops history when the sheet pushed the previous entry", () => {
    const browser = fakeBrowser("/owner/dashboard");
    pushSheet(browser.history, browser.location(), "schedule", "when");
    pushStep(browser.history, browser.location(), "schedule", "repeat");
    stepBack(browser.history, browser.location(), "schedule", "when");
    expect(browser.url()).toBe("/owner/dashboard?sheet=schedule&step=when");
    expect(browser.entries()).toHaveLength(3); // forward entry still there, as after a real Back
  });

  it("in-app StepBack on the sheet's first entry rewrites in place", () => {
    const browser = fakeBrowser("/owner/dashboard");
    pushSheet(browser.history, browser.location(), "schedule", "review");
    stepBack(browser.history, browser.location(), "schedule", "repeat");
    expect(browser.url()).toBe("/owner/dashboard?sheet=schedule&step=repeat");
    expect(readSheetDepth(browser.history.state)).toBe(1);
    closeSheet(browser.history, browser.location());
    expect(browser.url()).toBe("/owner/dashboard");
  });

  it("replaceStep keeps the depth", () => {
    const browser = fakeBrowser("/owner/dashboard");
    pushSheet(browser.history, browser.location(), "schedule", "game");
    pushStep(browser.history, browser.location(), "schedule", "when");
    replaceStep(browser.history, browser.location(), "schedule", "repeat");
    expect(readSheetDepth(browser.history.state)).toBe(2);
    expect(browser.entries()).toHaveLength(3);
  });

  it("a deep link is normalised to a clean dashboard entry with the sheet on top", () => {
    const browser = fakeBrowser("/owner/dashboard?x=1&sheet=rewards&step=prize#top");
    expect(normalizeLandedSheet(browser.history, browser.location())).toBe(true);
    expect(browser.entries()).toEqual([
      "/owner/dashboard?x=1#top",
      "/owner/dashboard?x=1&sheet=rewards&step=prize#top",
    ]);
    closeSheet(browser.history, browser.location());
    expect(browser.url()).toBe("/owner/dashboard?x=1#top");
  });

  it("normalisation is a no-op when closed, or on a reload mid-flow", () => {
    const closed = fakeBrowser("/owner/dashboard");
    expect(normalizeLandedSheet(closed.history, closed.location())).toBe(false);
    expect(closed.entries()).toEqual(["/owner/dashboard"]);

    const reloaded = fakeBrowser("/owner/dashboard?sheet=schedule&step=when", { [SHEET_DEPTH_KEY]: 2 });
    expect(normalizeLandedSheet(reloaded.history, reloaded.location())).toBe(false);
    expect(reloaded.entries()).toHaveLength(1);
  });

  it("closing a sheet that pushed nothing rewrites the URL in place", () => {
    const browser = fakeBrowser("/owner/dashboard?sheet=schedule&x=1");
    closeSheet(browser.history, browser.location());
    expect(browser.url()).toBe("/owner/dashboard?x=1");
    expect(browser.entries()).toHaveLength(1);
  });
});
