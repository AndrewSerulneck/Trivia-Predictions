import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CategoryBlitzIntermissionScreen } from "@/components/venue-screen/CategoryBlitzIntermissionScreen";
import { CategoryBlitzScreen } from "@/components/venue-screen/CategoryBlitzScreen";
import type { VenueScreenState } from "@/lib/venueScreen";

type CategoryBlitzState = Extract<VenueScreenState, { mode: "category-blitz" }>;

function makeCategoryBlitzState(
  overrides: Partial<CategoryBlitzState["categoryBlitz"]> = {}
): CategoryBlitzState {
  return {
    ok: true,
    mode: "category-blitz",
    venue: {
      id: "venue-1",
      name: "Hightop Pub",
      displayName: "Hightop Pub TV",
      screenBrandImageUrl: null,
      screenBrandPrimary: null,
      screenBrandSecondary: null,
    },
    liveTrivia: null,
    categoryBlitz: {
      phase: "round",
      roundId: "round-1",
      letter: "M",
      categories: ["Movies", "Music", "Mountains"],
      secondsRemaining: 59,
      leaderboard: null,
      ...overrides,
    },
    idle: null,
    updatedAt: Date.parse("2026-07-02T20:00:00.000Z"),
  };
}

describe("Category Blitz venue screen components", () => {
  it("renders the active round with letter, categories, and countdown", () => {
    // Venue name is no longer rendered inside CategoryBlitzScreen — it's
    // shown once by VenueScreenClient's shared header. nowMs === updatedAt
    // so no time has "elapsed" locally.
    const state = makeCategoryBlitzState();
    const html = renderToStaticMarkup(
      React.createElement(CategoryBlitzScreen, { state, nowMs: state.updatedAt })
    );

    expect(html).toContain("Category Blitz");
    expect(html).toContain("Your letter");
    expect(html).toContain("M");
    expect(html).toContain("Movies");
    expect(html).toContain("Music");
    expect(html).toContain("Mountains");
    expect(html).toContain("59");
  });

  it("renders the intermission leaderboard mapped to the 'next round' phase", () => {
    // The backend's "intermission" phase maps to TvBlitzResults's "next"
    // phase (countdown to the next round) — see CategoryBlitzIntermissionScreen.
    const state = makeCategoryBlitzState({
      phase: "intermission",
      letter: "M",
      leaderboard: [
        { rank: 1, username: "casey", points: 30 },
        { rank: 2, username: "morgan", points: 24 },
      ],
    });
    const html = renderToStaticMarkup(
      React.createElement(CategoryBlitzIntermissionScreen, { state, nowMs: state.updatedAt })
    );

    expect(html).toContain("Next round up");
    expect(html).toContain("Starting in");
    expect(html).toContain("casey");
    expect(html).toContain("30");
    expect(html).toContain("morgan");
    expect(html).toContain("24");
  });

  it("renders the results leaderboard with an explicit results label", () => {
    const state = makeCategoryBlitzState({
      phase: "results",
      letter: "M",
      leaderboard: [{ rank: 1, username: "casey", points: 44 }],
    });
    const html = renderToStaticMarkup(
      React.createElement(CategoryBlitzIntermissionScreen, { state, nowMs: state.updatedAt })
    );

    expect(html).toContain("Round results");
    expect(html).toContain("Category Blitz");
    expect(html).toContain("casey");
    expect(html).toContain("44");
  });
});
