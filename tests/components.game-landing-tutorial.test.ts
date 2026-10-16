// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TUTORIAL_SKIP_ATTRIBUTE, tutorialSeenStorageKey } from "@/lib/gameOnboarding";
import { VENUE_GAME_CARD_BY_KEY } from "@/lib/venueGameCards";

// Phase 6 of docs/partner-results-page-plan.md (review fixes F1–F3): the
// "seen recently" skip enters the game the way Play does, the cards are
// server-rendered again for autoResume={false} hosts, and a showing is counted
// only when the player taps Play. createElement, not JSX (*.test.ts glob).

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/ui/PageShell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/venue/VenuePresenceBoundary", () => ({
  VenuePresenceBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/analytics", () => ({ startGameSession: vi.fn(), endCurrentGameSession: vi.fn() }));
vi.mock("@/lib/gameResume", () => ({ hasResumableSession: vi.fn(async () => false) }));
vi.mock("@/lib/storage", () => ({ getVenueId: () => "" }));

const { GameLandingExperience } = await import("@/components/venue/GameLandingExperience");

type LandingProps = ComponentProps<typeof GameLandingExperience>;
const landing = (props: Partial<LandingProps>) =>
  createElement(
    GameLandingExperience,
    { gameKey: "pickem", autoResume: false, ...props } as LandingProps,
    createElement("div", null, "THE GAME")
  );

const pickemKey = tutorialSeenStorageKey("pickem");
const firstHeading = VENUE_GAME_CARD_BY_KEY.pickem.steps[0].heading;
const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
});

const goToLastCard = () => {
  while (screen.queryByRole("button", { name: "Next" })) {
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
  }
};

describe("GameLandingExperience tutorial cards", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, "", "/pickem");
    push.mockReset();
    replace.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("server-renders the cards for an autoResume={false} host, with the pre-paint script", () => {
    const html = renderToString(landing({}));
    expect(html).toContain(firstHeading);
    expect(html).toContain(pickemKey);
    expect(html).not.toContain("THE GAME");
  });

  it("goes straight into the game on a client-side mount when seen recently, without recording", async () => {
    window.localStorage.setItem(pickemKey, String(Date.now() - 60_000));
    const before = window.localStorage.getItem(pickemKey);
    render(landing({}));
    // Decided in the first render: no card ever appears.
    expect(screen.queryByText(firstHeading)).toBeNull();
    expect(screen.getByText("THE GAME")).toBeTruthy();
    await flush();
    expect(window.localStorage.getItem(pickemKey)).toBe(before);
  });

  it("shows the cards with the locked button when Play is disabled, even if seen recently", async () => {
    window.localStorage.setItem(pickemKey, String(Date.now() - 60_000));
    render(landing({ playDisabled: true, playDisabledLabel: "Locked" }));
    await flush();
    expect(screen.getByText(firstHeading)).toBeTruthy();
    goToLastCard();
    const locked = screen.getByRole("button", { name: "Locked" }) as HTMLButtonElement;
    expect(locked.disabled).toBe(true);
    expect(screen.queryByText("THE GAME")).toBeNull();
  });

  it("a skip with playHref replaces (not pushes) and keeps the query string", async () => {
    window.history.replaceState(null, "", "/bingo?date=2026-10-16&cardId=card-1");
    window.localStorage.setItem(tutorialSeenStorageKey("bingo"), String(Date.now() - 60_000));
    render(landing({ gameKey: "bingo", autoResume: true, playHref: "/bingo/home" }));
    await flush();
    expect(replace).toHaveBeenCalledWith("/bingo/home?date=2026-10-16&cardId=card-1");
    expect(push).not.toHaveBeenCalled();
  });

  it("Play with playHref pushes and keeps the query string, and records the showing", async () => {
    window.history.replaceState(null, "", "/bingo?date=2026-10-16&cardId=card-1");
    render(landing({ gameKey: "bingo", playHref: "/bingo/home", playLabel: "Play Bingo" }));
    await flush();
    goToLastCard();
    fireEvent.click(screen.getByRole("button", { name: "Play Bingo" }));
    expect(push).toHaveBeenCalledWith("/bingo/home?date=2026-10-16&cardId=card-1");
    expect(window.localStorage.getItem(tutorialSeenStorageKey("bingo"))).not.toBeNull();
  });

  it("Back on the first card records nothing", async () => {
    render(landing({}));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(window.localStorage.getItem(pickemKey)).toBeNull();
  });

  it("Play records the showing exactly once", async () => {
    vi.useFakeTimers();
    try {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      render(landing({}));
      await flush();
      expect(window.localStorage.getItem(pickemKey)).toBeNull();
      goToLastCard();
      fireEvent.click(screen.getByRole("button", { name: "Play" }));
      await act(async () => {
        vi.advanceTimersByTime(400);
      });
      expect(screen.getByText("THE GAME")).toBeTruthy();
      expect(setItem.mock.calls.filter(([key]) => key === pickemKey)).toHaveLength(1);
      setItem.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it("after hydration, a recent showing skips the server-rendered cards", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(landing({}));
    document.body.appendChild(container);
    window.localStorage.setItem(pickemKey, String(Date.now() - 60_000));
    await act(async () => {
      hydrateRoot(container, landing({}));
    });
    await flush();
    expect(container.textContent).toContain("THE GAME");
    expect(container.textContent).not.toContain(firstHeading);
    container.remove();
  });

  it("after hydration, cards that stay (Play locked) lose the pre-paint hide", async () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(landing({ playDisabled: true }));
    document.body.appendChild(container);
    window.localStorage.setItem(pickemKey, String(Date.now() - 60_000));
    // What the inline script would have done before the first paint.
    const wrapper = container.querySelector("script")?.parentElement;
    expect(wrapper).toBeTruthy();
    wrapper?.setAttribute(TUTORIAL_SKIP_ATTRIBUTE, "");
    await act(async () => {
      hydrateRoot(container, landing({ playDisabled: true }));
    });
    await flush();
    expect(container.textContent).toContain(firstHeading);
    expect(container.querySelector(`[${TUTORIAL_SKIP_ATTRIBUTE}]`)).toBeNull();
    container.remove();
  });
});
