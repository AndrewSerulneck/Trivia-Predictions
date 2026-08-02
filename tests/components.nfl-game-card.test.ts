import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NFLGameCard, type NFLGame } from "@/components/nfl-pickem/NFLGameCard";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      whileTap,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { whileTap?: unknown }) => React.createElement("div", props, children),
  },
}));

const BASE_GAME: NFLGame = {
  id: "game-1",
  homeTeam: "Bills",
  awayTeam: "Jets",
  startsAt: "2026-09-10T20:20:00.000Z",
  isLocked: false,
  status: "scheduled",
  homeScore: null,
  awayScore: null,
  winnerTeam: null,
  homeSpread: -3.5,
  awaySpread: 3.5,
  isThursdayGame: true,
  isSundayGame: false,
  isMondayGame: false,
  dayGroupKey: "2026-09-10",
  dayGroupLabel: "Thursday Night Football",
  isThursdayNightSection: true,
};

describe("NFLGameCard spread display", () => {
  it("hides spread labels in standard mode", () => {
    const markup = renderToStaticMarkup(
      React.createElement(NFLGameCard, {
        game: BASE_GAME,
        isLocked: false,
        scoringMode: "standard",
        onPick: () => undefined,
      }),
    );

    expect(markup).not.toContain("+3.5");
    expect(markup).not.toContain("-3.5");
  });

  it("shows spread labels in spread mode", () => {
    const markup = renderToStaticMarkup(
      React.createElement(NFLGameCard, {
        game: BASE_GAME,
        isLocked: false,
        scoringMode: "spread",
        onPick: () => undefined,
      }),
    );

    expect(markup).toContain("+3.5");
    expect(markup).toContain("-3.5");
  });

  it("renders PK for a pick'em line", () => {
    const markup = renderToStaticMarkup(
      React.createElement(NFLGameCard, {
        game: { ...BASE_GAME, homeSpread: 0, awaySpread: 0 },
        isLocked: false,
        scoringMode: "spread",
        onPick: () => undefined,
      }),
    );

    expect(markup).toContain("PK");
  });
});
