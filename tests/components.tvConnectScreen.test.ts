// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// docs/fire-tv-app-plan.md Phase CR1.5 (F7, F8, F9, F11): the Connect screen's poll loop under fake timers.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/tvApp", () => ({
  readRememberedTvVenueId: () => null,
  rememberTvVenueId: vi.fn(),
  forgetTvVenueId: vi.fn(),
}));

import { TvConnectScreen } from "@/components/venue-screen/TvConnectScreen";
import { TV_PAIR_POLL_MS, TV_PAIR_TTL_MS } from "@/lib/tvConnectShared";

type Reply = { status?: number; headers?: Record<string, string>; body: unknown };

const created = (expiresAt: string) => ({ ok: true, pairCode: "7K3M9Q", pollSecret: "S".repeat(43), expiresAt });
const reply = ({ status = 200, headers = {}, body }: Reply) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

let calls: string[] = [];
let statusReplies: Array<() => Promise<Response> | Response> = [];
let createReplies: Array<() => Response> = [];

const setVisibility = (value: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => value });
  document.dispatchEvent(new Event("visibilitychange"));
};

const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const mount = async () => {
  render(createElement(TvConnectScreen));
  await advance(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-25T20:00:00.000Z"));
  calls = [];
  statusReplies = [];
  createReplies = [];
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("/status")) {
        const next = statusReplies.shift();
        return next ? next() : reply({ body: { ok: true, state: "waiting", expiresAt: "x" } });
      }
      const next = createReplies.shift();
      return next ? next() : reply({ body: created(new Date(Date.now() + TV_PAIR_TTL_MS).toISOString()) });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const statusCalls = () => calls.filter((url) => url.includes("/status")).length;
const createCalls = () => calls.filter((url) => url.endsWith("/pairings")).length;

describe("TvConnectScreen poll loop", () => {
  it("F7: a claim in the last seconds still connects instead of showing expired", async () => {
    await mount();
    // Waiting all the way to the local deadline, then the final read finds the claim.
    statusReplies = Array.from({ length: 199 }, () => () => reply({ body: { ok: true, state: "waiting", expiresAt: "x" } }));
    statusReplies.push(() => reply({ body: { ok: true, state: "connected", venueId: "venue-1" } }));
    await advance(TV_PAIR_TTL_MS + TV_PAIR_POLL_MS);
    expect(screen.queryByTestId("tv-connected")).not.toBeNull();
    expect(screen.queryByText("Code expired")).toBeNull();
  });

  it("F7: with nothing claimed, the deadline does one last read, then shows expired", async () => {
    await mount();
    await advance(TV_PAIR_TTL_MS + TV_PAIR_POLL_MS);
    expect(statusCalls()).toBeGreaterThanOrEqual(200);
    expect(screen.queryByText("Code expired")).not.toBeNull();
  });

  it("F8: hiding and showing the screen during a held fetch keeps one poll chain (10 reads in 30 s)", async () => {
    await mount();
    let release: (value: Response) => void = () => undefined;
    statusReplies = [() => new Promise<Response>((resolve) => (release = resolve))];
    await advance(TV_PAIR_POLL_MS); // read 1 starts and is held
    setVisibility("hidden");
    setVisibility("visible");
    setVisibility("hidden");
    setVisibility("visible");
    release(reply({ body: { ok: true, state: "waiting", expiresAt: "x" } }));
    await advance(30_000 - TV_PAIR_POLL_MS);
    expect(statusCalls()).toBeLessThanOrEqual(10);
  });

  it("F9: a server expiresAt already past on the TV clock doesn't end polling", async () => {
    createReplies = [() => reply({ body: created(new Date(Date.now() - 3_600_000).toISOString()) })];
    await mount();
    await advance(TV_PAIR_POLL_MS * 3);
    expect(statusCalls()).toBe(3);
    expect(screen.queryByText("Code expired")).toBeNull();
    expect(screen.queryByTestId("tv-connect-qr")).not.toBeNull();
  });

  it("F9: the server's expired answer still ends it", async () => {
    await mount();
    statusReplies = [() => reply({ body: { ok: true, state: "expired" } })];
    await advance(TV_PAIR_POLL_MS);
    expect(screen.queryByText("Code expired")).not.toBeNull();
  });
});

describe("TvConnectScreen renewing", () => {
  const press = (key: string) =>
    act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key }));
      await vi.advanceTimersByTimeAsync(0);
    });

  it("F11: after a 429, other keys and focus send nothing; OK after Retry-After renews", async () => {
    createReplies = [() => reply({ status: 429, headers: { "Retry-After": "30" }, body: { ok: false } })];
    await mount();
    expect(screen.queryByText("Can't connect.")).not.toBeNull();
    expect(createCalls()).toBe(1);

    await press("ArrowDown");
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(createCalls()).toBe(1);

    await press("Enter"); // inside Retry-After
    expect(createCalls()).toBe(1);

    await advance(31_000);
    await press("Enter");
    expect(createCalls()).toBe(2);
    expect(screen.queryByTestId("tv-connect-qr")).not.toBeNull();
  });

  // F66: one OK on the boxes does one thing.
  it("F66: OK on the boxes with an expired code renews once and doesn't open the input", async () => {
    await mount();
    await advance(TV_PAIR_TTL_MS + TV_PAIR_POLL_MS);
    expect(screen.queryByText("Code expired")).not.toBeNull();
    const boxes = screen.getByTestId("tv-connect-code-boxes");
    expect(document.activeElement).toBe(boxes);
    await act(async () => {
      fireEvent.keyDown(boxes, { key: "Enter" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(createCalls()).toBe(2);
    expect(document.activeElement).not.toBe(screen.getByTestId("tv-connect-code"));
  });

  it("F66: inside a 429's Retry-After, OK on the boxes opens the input and renews nothing", async () => {
    createReplies = [() => reply({ status: 429, headers: { "Retry-After": "30" }, body: { ok: false } })];
    await mount();
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("tv-connect-code-boxes"), { key: "Enter" });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(createCalls()).toBe(1);
    expect(document.activeElement).toBe(screen.getByTestId("tv-connect-code"));
  });

  it("F66: leaving the input returns focus to the boxes, but not when going to Try demo", async () => {
    await mount();
    const boxes = screen.getByTestId("tv-connect-code-boxes");
    const input = screen.getByTestId("tv-connect-code");
    act(() => input.focus());
    act(() => input.blur());
    expect(document.activeElement).toBe(boxes);
    act(() => input.focus());
    act(() => screen.getByText("Try demo").focus());
    expect(document.activeElement).toBe(screen.getByText("Try demo"));
  });
});
