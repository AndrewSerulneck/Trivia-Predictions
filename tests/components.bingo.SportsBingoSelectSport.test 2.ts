// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

// Phase 6 of docs/prop-bingo-code-review-fix-plan.md flagged that the
// `league.note ?? "Coming soon"` render (SportsBingoSelectSport.tsx:58) had no fixture — only the
// route-level `/api/bingo/leagues` contract test (tests/api.bingo.leagues.test.ts) covered the
// status strings the component consumes, never how it renders them. This is the one surface where
// Phase 6's two statuses (`out_of_season`, `coming_soon`) could visibly recombine: a `coming_soon`
// league with a custom `note` must show that note, and must never fall back to the
// `out_of_season` copy ("Out of season · …").
// No JSX (repo's vitest config only globs *.test.ts, not *.test.tsx) — createElement stands in,
// same convention as tests/admin-modal-sheet.a11y.test.ts.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const { SportsBingoSelectSport } = await import("@/components/bingo/SportsBingoSelectSport");

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SportsBingoSelectSport", () => {
  it("renders a coming_soon league's own note, not the out_of_season copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          leagues: [
            {
              key: "americanfootball_nfl",
              label: "NFL",
              icon: "🏈",
              status: "coming_soon",
              note: "Kicks off in September",
            },
          ],
        })
      )
    );

    render(createElement(SportsBingoSelectSport));

    await waitFor(() => {
      expect(screen.getByText("Kicks off in September")).toBeTruthy();
    });
    expect(screen.queryByText(/Out of season/)).toBeNull();
  });

  it("falls back to 'Coming soon' when a coming_soon league carries no note", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          leagues: [
            { key: "americanfootball_nfl", label: "NFL", icon: "🏈", status: "coming_soon" },
          ],
        })
      )
    );

    render(createElement(SportsBingoSelectSport));

    await waitFor(() => {
      expect(screen.getByText("Coming soon")).toBeTruthy();
    });
  });

  it("renders an out_of_season league's resumesLabel copy, not a coming_soon note", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          leagues: [
            {
              key: "baseball_mlb",
              label: "MLB",
              icon: "⚾",
              status: "out_of_season",
              resumesLabel: "Resumes April 2027",
            },
          ],
        })
      )
    );

    render(createElement(SportsBingoSelectSport));

    await waitFor(() => {
      expect(screen.getByText("Out of season · Resumes April 2027")).toBeTruthy();
    });
  });
});
