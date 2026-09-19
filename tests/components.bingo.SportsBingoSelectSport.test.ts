// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { SportsBingoSelectSport } = await import("@/components/bingo/SportsBingoSelectSport");

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SportsBingoSelectSport", () => {
  it("renders only leagues returned as currently available and sends the timezone", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        incomplete: false,
        leagues: [
          { key: "basketball_nba", label: "NBA", icon: "🏀" },
          { key: "americanfootball_nfl", label: "NFL", icon: "🏈" },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(SportsBingoSelectSport));

    expect(await screen.findByRole("button", { name: /NBA/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /NFL/ })).toBeTruthy();
    expect(screen.queryByText("WNBA")).toBeNull();
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/tzOffsetMinutes=/);
  });

  it("renders a successful-empty message without static fallback leagues", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true, incomplete: false, leagues: [] })));
    render(createElement(SportsBingoSelectSport));

    expect(await screen.findByText("No games are available for board creation today.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /NBA/ })).toBeNull();
  });

  it("keeps verified choices and shows a retryable warning for a partial failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          incomplete: true,
          warning: "Some leagues could not be checked right now. Try again in a moment.",
          leagues: [{ key: "baseball_mlb", label: "MLB", icon: "⚾" }],
        })
      )
    );
    render(createElement(SportsBingoSelectSport));

    expect(await screen.findByRole("button", { name: /MLB/ })).toBeTruthy();
    expect(screen.getByText(/Some leagues could not be checked/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();
    expect(screen.queryByText(/No games are available/)).toBeNull();
  });

  it("shows a retryable failure and never makes static leagues clickable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ ok: false, error: "We could not check available Bingo games right now." }, false, 503)
      )
    );
    render(createElement(SportsBingoSelectSport));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Try Again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /NBA/ })).toBeNull();
  });
});
