import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GAME_TILE_THEMES, gameTileTitleLines } from "@/components/game-themes/gameTileThemes";
import { VenueGamesPanel } from "@/components/venue/VenueGamesPanel";
import { GAME_TITLE_LINES_BY_KEY, VENUE_HUB_TILE_SUBTITLE_BY_KEY } from "@/components/venue/venueHubShared";
import { VENUE_GAME_CARDS, type VenueGameKey } from "@/lib/venueGameCards";

// docs/game-themes-plan.md — Standing rules. Every Venue Home game button wears its game's theme; the
// words come from GAME_TITLE_LINES_BY_KEY (a theme styles them, never renames them); artwork is
// decoration; Tailwind only (no inline style) in the theme files and the panel.

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string): string => readFileSync(path.join(ROOT, relativePath), "utf8");

const renderPanel = (): string =>
  renderToStaticMarkup(
    React.createElement(VenueGamesPanel, {
      contentReady: true,
      showFastPathSkeleton: false,
      arrivalStatusText: "",
      arrivalStage: "ready",
      arrivalProgress: 100,
      liveTriviaStatus: { live: false, label: "", nextStartAtMs: null, failureReason: null, recurringType: null, recurringDays: [] },
      nextLiveTriviaCountdownLabel: "",
      nextLiveTriviaCountdownSeconds: null,
      lobbyButtonShouldPulse: false,
      pendingDestination: null,
      orderedHomeCards: VENUE_GAME_CARDS,
      teaserGames: new Set<VenueGameKey>(),
      visibleBadgeByGame: new Map(),
      badgeError: "",
      onGoTo: () => {},
      onRetryBadges: () => {},
    }),
  );

describe("Venue Home game themes", () => {
  it("every game on Venue Home has a theme", () => {
    for (const card of VENUE_GAME_CARDS) expect(GAME_TILE_THEMES[card.key], card.key).toBeDefined();
  });

  it("the title lines are the game's on-screen name, only split, never reworded", () => {
    for (const card of VENUE_GAME_CARDS) {
      const name = GAME_TITLE_LINES_BY_KEY[card.key].join(" ").replace(/\s+/g, " ").trim();
      expect(gameTileTitleLines(card.key).join(" "), card.key).toBe(name);
    }
  });

  it("each button shows its title words and subtitle, with the artwork hidden from screen readers", () => {
    const html = renderPanel();
    for (const card of VENUE_GAME_CARDS) {
      expect(html).toContain(`data-venue-game-card="${card.key}"`);
      for (const word of gameTileTitleLines(card.key)) expect(html, card.key).toContain(`>${word.replace(/'/g, "&#x27;")}<`);
      expect(html).toContain(VENUE_HUB_TILE_SUBTITLE_BY_KEY[card.key].replace(/'/g, "&#x27;"));
    }
    // Every <svg> on the buttons is decoration.
    const buttons = html.split("data-venue-game-card=").slice(1).join("");
    const svgs = buttons.match(/<svg[^>]*>/g) ?? [];
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
  });

  it("Tailwind only: no inline style in the theme files or the panel", () => {
    for (const file of [
      "components/game-themes/gameTileThemes.tsx",
      "components/game-themes/sportBalls.tsx",
      "components/venue/VenueGamesPanel.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/style=\{\{/);
    }
  });
});
