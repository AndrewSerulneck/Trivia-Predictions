// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 5, on the REAL
// Partner Dashboard page. Finding F4 was: HTML -> JS -> GET /api/owner/venues ->
// THEN /api/owner/schedule + /api/owner/competitions. Three invocations, three
// `requireOwnerAuth` calls (6 of the 9 queries), up to three cold starts.
//
// What must hold now:
//   P1 — the first paint makes exactly ONE request, to /api/owner/dashboard, and
//        both sections are filled from it.
//   P2 — a per-section failure inside that one payload still shows the other section.
//   P3 — Retry on a failed section goes back to that section's own endpoint.
//   P4 — a venue switch still uses the per-list endpoints (the seed is not reused).
//   P5 — and switching BACK to the first venue refetches it too: the seed is
//        consumed once, never re-adopted by a later mount of the same venue.
// createElement, not JSX (*.test.ts glob).

vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  };
  // ONE router object, like Next's: the page's fetch effect depends on [router], so a
  // fresh object per render would refetch forever.
  const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };
  return {
    useRouter: () => router,
    usePathname: () => "/owner/dashboard",
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => window.location.search);
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/authFastPath", () => ({ hardClearAuthAndCache: vi.fn() }));

const { default: OwnerDashboardPage } = await import("@/app/owner/dashboard/page");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const VENUES = [
  { id: "venue-1", name: "The Hightop" },
  { id: "venue-2", name: "Second Spot" },
];

/**
 * A game the ONE-SHOT payload carries for venue-1. The per-list `/api/owner/schedule`
 * stub answers empty, so this row renders only while the seed is what is on screen —
 * which is what lets P5 see a stale seed being re-adopted.
 */
const SEEDED_GAME = {
  id: "sched-1",
  venueId: "venue-1",
  title: "Thursday Night Showdown",
  // Far future, so it lands in "upcoming" whatever the clock says.
  startTime: "2099-01-01T23:00:00.000Z",
  endTime: "2099-01-02T01:00:00.000Z",
  timezone: "America/New_York",
  gameType: "live_trivia",
  rounds: 1,
  recurringType: "none",
  recurringDays: [],
  isActive: true,
};

type OneShot = {
  venues?: Array<{ id: string; name: string }>;
  venueId?: string | null;
  schedules?: unknown;
  competitions?: unknown;
};

/** Stub fetch with a one-shot payload; per-list routes answer empty unless overridden. */
const stubApi = (oneShot: OneShot = {}) => {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("/api/owner/dashboard")) {
      return json({
        ok: true,
        venues: VENUES,
        venueId: "venue-1",
        schedules: { ok: true, items: [] },
        competitions: { ok: true, items: [] },
        ...oneShot,
      });
    }
    if (url.startsWith("/api/owner/schedule")) return json({ ok: true, schedules: [] });
    if (url.startsWith("/api/owner/competitions")) return json({ ok: true, competitions: [] });
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
};

/** Render and wait for the one-step reveal (both sections present together). */
const openDashboard = async () => {
  render(createElement(OwnerDashboardPage));
  await waitFor(() => {
    expect(screen.getByRole("region", { name: "Live Games" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Offer Rewards" })).toBeTruthy();
  });
  // Let the loader's minimum-visible timer and any trailing effect settle.
  await act(async () => {
    await Promise.resolve();
  });
};

/** Pick a venue from the bar's switcher and wait for the bar to show it. */
const switchVenue = async (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Select venue" }));
  fireEvent.click(screen.getByRole("option", { name }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Select venue" }).textContent).toContain(name)
  );
};

describe("Partner Dashboard first load (speed plan Phase 5)", () => {
  beforeAll(() => {
    // useModalOverlay restores scroll on close; jsdom doesn't implement it.
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  beforeEach(() => {
    window.history.replaceState(null, "", "/owner/dashboard");
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  it("P1: makes exactly one request, and fills both sections from it", async () => {
    const calls = stubApi();
    await openDashboard();

    expect(calls).toEqual(["/api/owner/dashboard"]);
    // Both sections are READY (their empty states), not skeletons: the seed landed.
    expect(screen.getByText("Pick a game and a time. Your whole room plays together.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Offer your guests a reward/ })).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading live games" })).toBeNull();
    expect(screen.queryByRole("status", { name: "Loading rewards" })).toBeNull();
  });

  it("P1: carries the rows through, so the seed is really what renders", async () => {
    const calls = stubApi({ schedules: { ok: true, items: [SEEDED_GAME] } });
    await openDashboard();

    expect(calls).toEqual(["/api/owner/dashboard"]);
    expect(screen.getByText("Thursday Night Showdown")).toBeTruthy();
  });

  it("P2: one failed list in the payload still shows the other section", async () => {
    stubApi({ schedules: { ok: false, error: "schedules are down" } });
    await openDashboard();

    expect(screen.getByText("schedules are down")).toBeTruthy();
    // Rewards still rendered its own (empty) answer.
    expect(screen.getByRole("button", { name: /Offer your guests a reward/ })).toBeTruthy();
  });

  it("P2: a failed list with no message falls back to the section's own copy", async () => {
    stubApi({ competitions: { ok: false } });
    await openDashboard();
    expect(screen.getByText("Couldn't load your rewards.")).toBeTruthy();
  });

  it("P3: Retry on a failed section goes back to that section's own endpoint", async () => {
    const calls = stubApi({ schedules: { ok: false, error: "schedules are down" } });
    await openDashboard();
    expect(calls).toEqual(["/api/owner/dashboard"]);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByText("Pick a game and a time. Your whole room plays together.")).toBeTruthy();
    });
    expect(calls).toEqual(["/api/owner/dashboard", "/api/owner/schedule?venueId=venue-1"]);
    // Retry refreshes ONE section in place; it must not re-run the whole first load.
    expect(calls.filter((url) => url.startsWith("/api/owner/dashboard"))).toHaveLength(1);
  });

  it("P4: a venue switch uses the per-list endpoints, never the first venue's seed", async () => {
    const calls = stubApi();
    await openDashboard();

    await switchVenue("Second Spot");

    await waitFor(() => {
      expect(calls).toContain("/api/owner/schedule?venueId=venue-2");
      expect(calls).toContain("/api/owner/competitions?venueId=venue-2");
    });
    expect(calls.filter((url) => url.startsWith("/api/owner/dashboard"))).toHaveLength(1);
  });

  it("P5: switching BACK to the first venue refetches it, instead of re-adopting the seed", async () => {
    // The seed is single-use. It describes venue-1 as it was when the page opened, and
    // the body is keyed by venue — so without consuming it, A -> B -> A remounts the
    // body with the seed still matching, which re-adopts that old payload AND
    // suppresses both refetches. A game scheduled for A earlier in the session would
    // silently vanish, with no loading state, until a full reload.
    const calls = stubApi({ schedules: { ok: true, items: [SEEDED_GAME] } });
    await openDashboard();
    expect(screen.getByText("Thursday Night Showdown")).toBeTruthy();

    await switchVenue("Second Spot");
    await waitFor(() => expect(calls).toContain("/api/owner/schedule?venueId=venue-2"));

    await switchVenue("The Hightop");

    // Back on venue-1, it ASKS again rather than re-seeding...
    await waitFor(() => {
      expect(calls).toContain("/api/owner/schedule?venueId=venue-1");
      expect(calls).toContain("/api/owner/competitions?venueId=venue-1");
    });
    // ...and what renders is that answer (the stub has no games), not the stale row.
    await waitFor(() => expect(screen.queryByText("Thursday Night Showdown")).toBeNull());
    // Still exactly one first-load call for the whole session.
    expect(calls.filter((url) => url.startsWith("/api/owner/dashboard"))).toHaveLength(1);
  });

  it("shows 'No venue found' for an account with no venue, and asks for no list", async () => {
    const calls = stubApi({ venues: [], venueId: null, schedules: null, competitions: null });
    render(createElement(OwnerDashboardPage));
    await waitFor(() => expect(screen.getByText("No venue found for this account.")).toBeTruthy());
    expect(calls).toEqual(["/api/owner/dashboard"]);
  });
});
