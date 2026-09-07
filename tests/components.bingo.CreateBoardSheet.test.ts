// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Phase 4 of docs/prop-bingo-page-simplification-plan.md moved board creation off the three
 * `/bingo/select-*` routes and into a slide-up sheet over `/bingo/home`, WITHOUT forking the
 * step components: each one grew optional props that override its router behaviour, and the
 * routes still render them prop-less.
 *
 * That "one component, two hosts" arrangement is exactly the thing a refactor silently breaks —
 * a stray `router.push` left in the hosted path navigates the player off the page mid-sheet, and
 * nothing else in the suite would notice. These tests pin both halves: the callback path fires
 * the callback and never navigates, and the prop-less path still navigates.
 *
 * No JSX (the repo's vitest config only globs *.test.ts) — createElement stands in, same
 * convention as tests/components.bingo.SportsBingoSelectSport.test.ts.
 */

const routerPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams(""),
}));

const { SportsBingoSelectSport } = await import("@/components/bingo/SportsBingoSelectSport");
const { CreateBoardSheet } = await import("@/components/bingo/CreateBoardSheet");

const NBA_LEAGUE = { key: "basketball_nba", label: "NBA", icon: "🏀", status: "in_season" };

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

/** Routes the three endpoints the sheet's first two steps hit. */
function stubBingoFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/bingo/leagues")) {
        return jsonResponse({ ok: true, leagues: [NBA_LEAGUE] });
      }
      if (url.includes("/api/bingo/games")) {
        return jsonResponse({ ok: true, games: [] });
      }
      return jsonResponse({ ok: true, cards: [] });
    })
  );
}

beforeEach(() => {
  routerPush.mockClear();
  stubBingoFetch();
  // jsdom ships no matchMedia; the sheet reads it to no-op its exit timer under reduced motion.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SportsBingoSelectSport host-agnostic props (plan 4a)", () => {
  it("calls onSelectSport instead of navigating when the sheet supplies it", async () => {
    const onSelectSport = vi.fn();
    render(createElement(SportsBingoSelectSport, { onSelectSport }));

    fireEvent.click(await screen.findByRole("button", { name: /NBA/ }));

    expect(onSelectSport).toHaveBeenCalledWith("basketball_nba");
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("still navigates to /bingo/select-game when rendered prop-less by the standalone route", async () => {
    render(createElement(SportsBingoSelectSport, {}));

    fireEvent.click(await screen.findByRole("button", { name: /NBA/ }));

    expect(routerPush).toHaveBeenCalledWith("/bingo/select-game?sportKey=basketball_nba");
  });

  it("keeps its own 'Step 1 of 3' eyebrow unless the sheet header is carrying it", async () => {
    const { rerender } = render(createElement(SportsBingoSelectSport, {}));
    expect(await screen.findByText("Step 1 of 3")).toBeTruthy();

    rerender(createElement(SportsBingoSelectSport, { hideStepHeading: true }));
    expect(screen.queryByText("Step 1 of 3")).toBeNull();
    expect(screen.getByText("Choose A League")).toBeTruthy();
  });
});

describe("CreateBoardSheet (plan 4b)", () => {
  it("advances step 1 → 2 in place, with no route change", async () => {
    render(createElement(CreateBoardSheet, { onClose: vi.fn(), onCreated: vi.fn() }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: /NBA/ }));

    expect(await screen.findByText("Step 2 of 3")).toBeTruthy();
    expect(screen.getByText("Choose A Game")).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("steps back to the league picker from the header chevron", async () => {
    render(createElement(CreateBoardSheet, { onClose: vi.fn(), onCreated: vi.fn() }));

    fireEvent.click(await screen.findByRole("button", { name: /NBA/ }));
    await screen.findByText("Step 2 of 3");

    fireEvent.click(screen.getByRole("button", { name: "Back to step 1 of 3" }));

    expect(await screen.findByText("Step 1 of 3")).toBeTruthy();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("has no step-back control on step 1 — Close is the only way out of the first step", async () => {
    render(createElement(CreateBoardSheet, { onClose: vi.fn(), onCreated: vi.fn() }));

    await screen.findByRole("button", { name: /NBA/ });

    expect(screen.queryByRole("button", { name: /^Back to step/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Close board creation" })).toBeTruthy();
  });

  it("closes on Escape, and only after the slide-down has run", async () => {
    const onClose = vi.fn();
    render(createElement(CreateBoardSheet, { onClose, onCreated: vi.fn() }));

    fireEvent.keyDown(window, { key: "Escape" });

    // The unmount is deferred to the exit timer, never fired synchronously.
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
