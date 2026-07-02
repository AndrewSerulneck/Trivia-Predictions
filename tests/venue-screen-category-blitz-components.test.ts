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
  it("renders the active round with venue, letter, categories, and countdown", () => {
    const html = renderToStaticMarkup(
      React.createElement(CategoryBlitzScreen, { state: makeCategoryBlitzState() })
    );

    expect(html).toContain("Hightop Pub TV");
    expect(html).toContain("Current Letter");
    expect(html).toContain("M");
    expect(html).toContain("Movies");
    expect(html).toContain("Music");
    expect(html).toContain("Mountains");
    expect(html).toContain("0:59");
  });

  it("renders the intermission leaderboard with an explicit intermission label", () => {
    const state = makeCategoryBlitzState({
      phase: "intermission",
      leaderboard: [
        { rank: 1, username: "casey", points: 30 },
        { rank: 2, username: "morgan", points: 24 },
      ],
    });
    const html = renderToStaticMarkup(
      React.createElement(CategoryBlitzIntermissionScreen, { state })
    );

    expect(html).toContain("Round Intermission");
    expect(html).toContain("Scores locked while the next round loads");
    expect(html).toContain("#1");
    expect(html).toContain("casey");
    expect(html).toContain("30");
    expect(html).toContain("#2");
    expect(html).toContain("morgan");
    expect(html).toContain("24");
  });

  it("renders the results leaderboard with an explicit results label", () => {
    const state = makeCategoryBlitzState({
      phase: "results",
      leaderboard: [{ rank: 1, username: "casey", points: 44 }],
    });
    const html = renderToStaticMarkup(
      React.createElement(CategoryBlitzIntermissionScreen, { state })
    );

    expect(html).toContain("Round Results");
    expect(html).toContain("Category Blitz Leaderboard");
    expect(html).toContain("casey");
    expect(html).toContain("44");
  });
});
