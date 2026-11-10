// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Away mode (away-mode plan, Phase C1): on Venue Home, out of range = view-only, never the blocking overlay.
const state = vi.hoisted(() => ({
  heartbeat: { ok: false, code: "VENUE_OUT_OF_RANGE" } as Record<string, unknown>,
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/venue/bar-1",
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/lib/geolocation", () => ({
  getCurrentLocation: vi.fn(async () => ({ latitude: 41, longitude: -74, accuracy: 20 })),
}));
vi.mock("@/lib/storage", () => ({
  AUTH_STATE_CHANGED_EVENT: "tp:auth-state-changed",
  getUserId: () => "user-1",
  getVenueId: () => "bar-1",
  getGodMode: () => false,
}));
vi.mock("@/components/push/PushPermissionCard", () => ({ PushPermissionCard: () => null }));
vi.mock("@/components/social-share/InviteFriendButton", () => ({ InviteFriendButton: () => null }));

import { VenuePresenceBoundary, useVenuePresence } from "@/components/venue/VenuePresenceBoundary";
import { VenueGamesPanel } from "@/components/venue/VenueGamesPanel";
import { VENUE_GAME_CARD_BY_KEY, VENUE_HOME_GAME_KEYS } from "@/lib/venueGameCards";
import { AWAY_PLAY_LABEL } from "@/lib/venueAwayMode";
import { VenuePanelFromUrl } from "@/components/venue/VenuePanelFromUrl";
import { signInListPath, venuePushPanelFromValue, venuePushPath, withVenuePanel } from "@/lib/pushLanding";

const Probe = () => {
  const presence = useVenuePresence();
  return createElement("p", { "data-testid": "probe" }, presence.isAway ? "away" : "here");
};

const boundary = (props: { venueId: string; awayMode?: boolean }) =>
  createElement(VenuePresenceBoundary as (p: typeof props) => ReturnType<typeof VenuePresenceBoundary>, props, createElement(Probe));

beforeEach(() => {
  sessionStorage.clear();
  state.heartbeat = { ok: false, code: "VENUE_OUT_OF_RANGE" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(state.heartbeat), { headers: { "Content-Type": "application/json" } }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VenuePresenceBoundary awayMode", () => {
  it("Venue Home: out of range makes the page view-only, with no overlay", async () => {
    render(boundary({ venueId: "bar-1", awayMode: true }));
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("away"));
    expect(screen.queryByText("You've left the venue")).toBeNull();
  });

  it("game screens (no awayMode) keep today's overlay", async () => {
    render(boundary({ venueId: "bar-1" }));
    await waitFor(() => expect(screen.getByText("You've left the venue")).toBeTruthy());
    expect(screen.getByTestId("probe").textContent).toBe("here");
  });

  it("Venue Home still overlays a session problem", async () => {
    state.heartbeat = { ok: false, code: "AUTH_REQUIRED" };
    render(boundary({ venueId: "bar-1", awayMode: true }));
    await waitFor(() => expect(screen.getByText("Sign in to keep playing")).toBeTruthy());
    expect(screen.getByTestId("probe").textContent).toBe("here");
  });

  it("a passed check turns play back on", async () => {
    state.heartbeat = { ok: true, presence: { status: "active" } };
    render(boundary({ venueId: "bar-1", awayMode: true }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByTestId("probe").textContent).toBe("here");
  });
});

describe("VenueGamesPanel away", () => {
  const props = (away: { addressLine: string | null; directionsUrl: string | null; checking: boolean } | null) => ({
    contentReady: true,
    showFastPathSkeleton: false,
    arrivalStatusText: "",
    arrivalStage: "ready" as const,
    arrivalProgress: 100,
    liveTriviaStatus: { live: false, label: "Thu 8:00 PM", nextStartAtMs: null, failureReason: null, recurringType: null, recurringDays: [] },
    nextLiveTriviaCountdownLabel: "Thu 8:00 PM",
    nextLiveTriviaCountdownSeconds: null,
    lobbyButtonShouldPulse: false,
    pendingDestination: null,
    orderedHomeCards: VENUE_HOME_GAME_KEYS.map((key) => VENUE_GAME_CARD_BY_KEY[key]),
    teaserGames: new Set<never>(),
    visibleBadgeByGame: new Map(),
    badgeError: "",
    onGoTo: vi.fn(),
    onRetryBadges: vi.fn(),
    away,
  });

  it("labels every play control 'Play at the bar' and shows Directions", () => {
    const { container } = render(
      createElement(VenueGamesPanel, props({ addressLine: "1010 Pacific St · Brooklyn, NY", directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=1%2C2", checking: false }))
    );
    expect(screen.getByText("View only")).toBeTruthy();
    expect(screen.getByText("1010 Pacific St · Brooklyn, NY")).toBeTruthy();
    expect(screen.getByText("Directions").getAttribute("href")).toContain("google.com/maps/dir");
    const playButtons = [...container.querySelectorAll("button")];
    expect(playButtons.length).toBe(VENUE_HOME_GAME_KEYS.length + 1);
    for (const button of playButtons) {
      expect(button.textContent).toContain(AWAY_PLAY_LABEL);
      expect(button.textContent).not.toMatch(/Enter\s*lobby/);
    }
  });

  it("hands every tap to the hub's guard (which re-checks before opening anything)", () => {
    const panelProps = props({ addressLine: null, directionsUrl: null, checking: false });
    const { container } = render(createElement(VenueGamesPanel, panelProps));
    fireEvent.click(container.querySelector("[data-venue-game-card]") as HTMLElement);
    expect(panelProps.onGoTo).toHaveBeenCalledOnce();
  });

  it("disables play while a re-check runs", () => {
    const { container } = render(createElement(VenueGamesPanel, props({ addressLine: null, directionsUrl: null, checking: true })));
    for (const button of container.querySelectorAll("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("at the bar, shows no away banner and no 'Play at the bar'", () => {
    render(createElement(VenueGamesPanel, props(null)));
    expect(screen.queryByText("View only")).toBeNull();
    expect(screen.queryByText(AWAY_PLAY_LABEL)).toBeNull();
  });
});

describe("a prize push to another bar (away-mode plan, Phase R3, finding 3)", () => {
  afterEach(() => {
    state.search = "";
    window.history.replaceState(null, "", "/");
  });

  it("signed in at A, a prize push to B opens B on Prizes after the sign-in list hop", () => {
    const pushSearch = new URL(venuePushPath("bar-b", "prizes"), "https://x").search;
    const signInList = new URL(signInListPath("bar-b", pushSearch), "https://x");
    const hardTarget = withVenuePanel(
      "/venue/bar-b?entryUser=u1&entryVenue=bar-b&entryAt=1",
      venuePushPanelFromValue(signInList.searchParams.get("panel"))
    );
    const target = new URL(hardTarget, "https://x");
    window.history.replaceState(null, "", `${target.pathname}${target.search}`);
    state.search = target.search;
    const onPanel = vi.fn();
    render(createElement(VenuePanelFromUrl, { onPanel }));
    expect(onPanel).toHaveBeenCalledWith(2);
  });
});
