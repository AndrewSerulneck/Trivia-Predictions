// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

// docs/join-merch-store-plan.md Phase 4.1, on the REAL Partner Dashboard page:
//   F1 — the Join Merch cart belongs to one venue: switching venues shows that
//        venue's own cart, and Review's "Ships to" is always the cart's venue.
//   F2 — the store opens from `?sheet=store` with no venue on the account (and
//        while venues load), with the free QR card; Review stays off.
// Phase 4.2, with the real `window.history`:
//   F3 — a reload on Review (the cart is gone) pops back to the Shop's entry
//        instead of rewriting Review's, so ONE phone Back closes the store.
//   F4 — "Back to store" never writes a literal `step=shop`.
// createElement, not JSX (*.test.ts glob).

// useSearchParams that follows the native history API, the way Next.js's
// patched pushState/replaceState keep the real one in sync.
const historyListeners = new Set<() => void>();
const notifyHistory = () => historyListeners.forEach((listener) => listener());

vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    historyListeners.add(listener);
    window.addEventListener("popstate", listener);
    return () => {
      historyListeners.delete(listener);
      window.removeEventListener("popstate", listener);
    };
  };
  // ONE router object, like Next's: the page's fetch effects depend on [router], so a
  // fresh object per render would refetch (and re-render) forever.
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

type VenueRow = { id: string; name: string };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Stub the dashboard's endpoints; the first load resolves when `release` is called
 * (default: at once).
 *
 * `/api/owner/dashboard` is the ONE call the first paint makes (speed plan Phase 5):
 * venue list + both sections behind one auth check. The per-list routes are still
 * stubbed because a venue switch, a Retry and a post-save refetch use them.
 */
const stubApi = (venues: VenueRow[], options: { hold?: boolean } = {}) => {
  let release: () => void = () => undefined;
  const gate = options.hold ? new Promise<void>((resolve) => (release = resolve)) : Promise.resolve();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/owner/dashboard")) {
        await gate;
        return json({
          ok: true,
          venues,
          venueId: venues[0]?.id ?? null,
          schedules: venues.length > 0 ? { ok: true, items: [] } : null,
          competitions: venues.length > 0 ? { ok: true, items: [] } : null,
        });
      }
      if (url.startsWith("/api/owner/schedule")) return json({ ok: true, schedules: [] });
      if (url.startsWith("/api/owner/competitions")) return json({ ok: true, competitions: [] });
      throw new Error(`unexpected fetch ${url}`);
    })
  );
  return { release: () => release() };
};

const go = (search: string) =>
  act(() => {
    window.history.pushState(null, "", `/owner/dashboard${search}`);
    notifyHistory();
  });

/**
 * Wait until BOTH `useOwnerSheet` consumers are mounted — `MerchStoreHost` (first
 * render) and `DashboardBody` (once the venue list lands).
 *
 * Why it matters: each one runs `normalizeLandedSheet` once, on mount. A `go()`
 * that lands a `?sheet=` URL while `DashboardBody` has yet to mount is then
 * normalised by it (depth 0 -> 1), and every push after that sits one level
 * deeper than the test intends — which silently moves `stepBack` off the
 * synchronous replace branch and onto the async `history.go(-1)` one. That is
 * what made F4 flake under full-suite timing while passing in isolation. The
 * venue switcher is NOT a sufficient gate: the page renders it, and it can
 * commit before the body mounts. Wait for a section the body itself renders.
 */
const awaitDashboardMounted = async () => {
  await screen.findByRole("button", { name: "Select venue" });
  await screen.findByRole("heading", { name: "Offer Rewards" });
};

const store = () => screen.getByRole("dialog", { name: "Order Join Merch" });

const productRow = (name: string): HTMLElement => {
  const row = within(store()).getByRole("heading", { name }).closest("li");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
};

const roundCoasterPack = () => within(productRow("Round Coasters")).getByLabelText(/Pack size/) as HTMLSelectElement;

/** Close the store (as its Close does) and wait for it to slide away. */
const closeStore = async () => {
  await go("");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Order Join Merch" })).toBeNull());
};

const switchVenue = async (name: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Select venue" }));
  fireEvent.click(screen.getByRole("option", { name }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Select venue" }).textContent).toContain(name));
};

describe("Partner Dashboard × Join Merch store (Phase 4.1)", () => {
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

  afterAll(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("F1: each venue has its own cart, and Review ships to the cart's venue", async () => {
    stubApi([
      { id: "venue-a", name: "Alpha Tap" },
      { id: "venue-b", name: "Bravo Bar" },
    ]);
    render(createElement(OwnerDashboardPage));
    await awaitDashboardMounted();

    // Venue A: pick a pack, review it.
    await go("?sheet=store");
    fireEvent.change(roundCoasterPack(), { target: { value: "250" } });
    expect(within(store()).getByText(/1 item · Subtotal/)).not.toBeNull();
    fireEvent.click(within(store()).getByRole("button", { name: /Review order/ }));
    notifyHistory();
    await waitFor(() => expect(within(store()).getByText("Ships to").nextElementSibling?.textContent).toBe("Alpha Tap"));
    await closeStore();

    // Venue B: its own, empty cart.
    await switchVenue("Bravo Bar");
    await go("?sheet=store");
    expect(roundCoasterPack().value).toBe("");
    expect(within(store()).getByText("Choose a quantity to start an order")).not.toBeNull();
    fireEvent.click(within(productRow("Table Tents")).getByRole("button", { name: "Increase Table Tents" }));
    fireEvent.click(within(store()).getByRole("button", { name: /Review order/ }));
    notifyHistory();
    await waitFor(() => expect(within(store()).getByText("Ships to").nextElementSibling?.textContent).toBe("Bravo Bar"));
    expect(within(store()).queryByText("Round Coasters")).toBeNull();
    await closeStore();

    // Back to A: A's cart, still shipping to A.
    await switchVenue("Alpha Tap");
    await go("?sheet=store");
    expect(roundCoasterPack().value).toBe("250");
    expect((within(store()).getByLabelText("Table Tents quantity") as HTMLInputElement).value).toBe("0");
    fireEvent.click(within(store()).getByRole("button", { name: /Review order/ }));
    notifyHistory();
    await waitFor(() => expect(within(store()).getByText("Ships to").nextElementSibling?.textContent).toBe("Alpha Tap"));
    const lines = [...store().querySelectorAll<HTMLElement>("li[data-line]")].map((l) => l.dataset.line);
    expect(lines).toEqual(["HTC-CST-RND-250"]);
  });

  it("F2: with no venue on the account, the store still opens with the free QR, and Review is off", async () => {
    stubApi([]);
    window.history.replaceState(null, "", "/owner/dashboard?sheet=store");
    render(createElement(OwnerDashboardPage));
    await screen.findByText("No venue found for this account.");

    expect(store()).not.toBeNull();
    expect(store().querySelector("[data-free-qr]")).not.toBeNull();
    expect(within(store()).getByText("Ordering needs a venue on your account.")).not.toBeNull();
    fireEvent.click(within(productRow("Table Tents")).getByRole("button", { name: "Increase Table Tents" }));
    expect((within(store()).getByRole("button", { name: /Review order/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("F2: the store opens while venues are still loading, then enables Review once one arrives", async () => {
    const api = stubApi([{ id: "venue-a", name: "Alpha Tap" }], { hold: true });
    window.history.replaceState(null, "", "/owner/dashboard?sheet=store");
    render(createElement(OwnerDashboardPage));

    expect(store()).not.toBeNull();
    expect(within(store()).getByText("Loading your venue…")).not.toBeNull();

    await act(async () => api.release());
    await waitFor(() => expect(within(store()).queryByText("Loading your venue…")).toBeNull());
    fireEvent.click(within(productRow("Table Tents")).getByRole("button", { name: "Increase Table Tents" }));
    expect((within(store()).getByRole("button", { name: /Review order/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  describe("sheet history (Phase 4.2)", () => {
    /** Every URL the app wrote through pushState/replaceState (Next's patched ones in the real app). */
    const spyHistoryWrites = () => {
      const urls: string[] = [];
      const record = (_data: unknown, _unused: string, url?: string | URL | null) => {
        if (url) urls.push(String(url));
      };
      const push = window.history.pushState.bind(window.history);
      const replace = window.history.replaceState.bind(window.history);
      vi.spyOn(window.history, "pushState").mockImplementation((data, unused, url) => {
        record(data, unused, url);
        push(data, unused, url);
      });
      vi.spyOn(window.history, "replaceState").mockImplementation((data, unused, url) => {
        record(data, unused, url);
        replace(data, unused, url);
      });
      return urls;
    };

    afterEach(() => {
      vi.mocked(window.history.pushState).mockRestore?.();
      vi.mocked(window.history.replaceState).mockRestore?.();
      vi.mocked(window.history.go).mockRestore?.();
    });

    it("F3: a reload on Review (venues still loading, empty cart) pops to the Shop, and one Back closes the store", async () => {
      // What Shop → Review left behind: [dashboard, Shop (depth 1), Review (depth 2)].
      window.history.pushState({ ownerSheetDepth: 1 }, "", "/owner/dashboard?sheet=store");
      window.history.pushState({ ownerSheetDepth: 2 }, "", "/owner/dashboard?sheet=store&step=review");
      const go = vi.spyOn(window.history, "go");
      const writes = spyHistoryWrites();

      // The reload: a fresh mount, so an empty cart, and venues not back yet (handoff 4.1 trap 4).
      const api = stubApi([{ id: "venue-a", name: "Alpha Tap" }], { hold: true });
      render(createElement(OwnerDashboardPage));
      expect(store()).not.toBeNull();
      await act(async () => api.release());

      await waitFor(() => expect(window.location.search).toBe("?sheet=store"));
      expect(window.history.state).toMatchObject({ ownerSheetDepth: 1 });
      expect(go).toHaveBeenCalledTimes(1);
      expect(go).toHaveBeenCalledWith(-1);
      expect(writes).toEqual([]); // popped, never rewritten
      expect(within(store()).getByText("Choose a quantity to start an order")).not.toBeNull();

      // One phone Back now leaves the store.
      await act(async () => window.history.back());
      await waitFor(() => expect(window.location.search).toBe(""));
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Order Join Merch" })).toBeNull());
    });

    it("F3: Forward back onto the spent Review entry is corrected again", async () => {
      window.history.pushState({ ownerSheetDepth: 1 }, "", "/owner/dashboard?sheet=store");
      window.history.pushState({ ownerSheetDepth: 2 }, "", "/owner/dashboard?sheet=store&step=review");
      stubApi([{ id: "venue-a", name: "Alpha Tap" }]);
      render(createElement(OwnerDashboardPage));
      await waitFor(() => expect(window.location.search).toBe("?sheet=store"));

      // history.forward() is asynchronous: wait until it has really landed on Review, or
      // the assertions below would pass against the URL from before it moved.
      const landedOnReview = new Promise<void>((resolve) => {
        const onPop = () => {
          if (window.location.search !== "?sheet=store&step=review") return;
          window.removeEventListener("popstate", onPop);
          resolve();
        };
        window.addEventListener("popstate", onPop);
      });
      await act(async () => {
        window.history.forward();
        await landedOnReview;
      });
      await waitFor(() => expect(window.location.search).toBe("?sheet=store"));
      expect(window.history.state).toMatchObject({ ownerSheetDepth: 1 });
      expect(within(store()).getByRole("button", { name: /Review order/ })).not.toBeNull();
    });

    it("F4: Shop → Review → Back to store never writes step=shop", async () => {
      stubApi([
        { id: "venue-a", name: "Alpha Tap" },
        { id: "venue-b", name: "Bravo Bar" },
      ]);
      render(createElement(OwnerDashboardPage));
      await awaitDashboardMounted();
      const writes = spyHistoryWrites();

      await go("?sheet=store");
      fireEvent.change(roundCoasterPack(), { target: { value: "100" } });
      fireEvent.click(within(store()).getByRole("button", { name: /Review order/ }));
      notifyHistory();
      await within(store()).findByRole("heading", { name: "Review your order" });
      // `go()` pushed the Shop with no depth, so Review is the sheet's first pushed entry and
      // Back rewrites it in place: the path where the old code wrote `step=shop`. Pinned,
      // because at depth 2 `stepBack` pops instead and this test would assert nothing.
      expect(window.history.state).toMatchObject({ ownerSheetDepth: 1 });
      fireEvent.click(within(store()).getByRole("button", { name: /Back to store/ }));
      notifyHistory();
      expect(window.location.search).toBe("?sheet=store");
      // The Shop's order bar is back (SlideSteps keeps the outgoing Review pane for its exit animation).
      await within(store()).findByRole("button", { name: /Review order/ });
      expect(writes.some((url) => url.includes("step=shop"))).toBe(false);
    });
  });
});
