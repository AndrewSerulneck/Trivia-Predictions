import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GAME_TILE_THEMES, gameTileTitleLines } from "@/components/game-themes/gameTileThemes";
import { VENUE_HUB_TILE_SUBTITLE_BY_KEY } from "@/components/venue/venueHubShared";
import { TvLiveTriviaPregame } from "@/components/venue-screen/TvLiveTriviaPregame";
import { APP_DOWNLOAD_DISPLAY_URL } from "@/lib/appDownloadLink";
import type { VenueScreenState } from "@/lib/venueScreen";

// docs/live-trivia-pregame-and-display-cleanup-plan.md, Phase 3: the pre-game screen.
type PregameState = Extract<VenueScreenState, { mode: "live-trivia-pregame" }>;

const startsAt = "2026-07-03T00:00:00.000Z";
const startMs = Date.parse(startsAt);

const makeState = (firstRoundCategory: string | null = "History"): PregameState => ({
  ok: true,
  mode: "live-trivia-pregame",
  venue: {
    id: "venue-1",
    name: "Hightop Pub",
    displayName: null,
    screenBrandImageUrl: null,
    screenBrandPrimary: null,
    screenBrandSecondary: null,
  },
  liveTrivia: null,
  categoryBlitz: null,
  idle: null,
  pregame: { gameId: "sched-1:2026-07-02", title: "Thursday Live Trivia", startsAt, firstRoundCategory },
  updatedAt: startMs,
});

const render = (nowMs: number, state = makeState()) =>
  renderToStaticMarkup(React.createElement(TvLiveTriviaPregame, { state, nowMs, accent: "#22d3ee" }));

describe("TvLiveTriviaPregame", () => {
  it("counts down to the start from the client clock", () => {
    expect(render(startMs - 899_000)).toContain("14:59");
    expect(render(startMs - 65_000)).toContain("1:05");
    expect(render(startMs)).toContain("0:00");
  });

  it("shows the three steps in order, and says Tap (phones)", () => {
    const html = render(startMs - 600_000);
    const order = ["Get the app", "Sign in", "Tap Live Trivia"].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toMatch(/click/i);
  });

  it("carries the app QR and its short link", () => {
    const html = render(startMs - 600_000);
    expect(html).toContain('data-testid="app-download-qr"');
    expect(html).toContain(APP_DOWNLOAD_DISPLAY_URL);
  });

  it("shows the real Venue Home tile face: same words, subtitle and theme as the phone", () => {
    const html = render(startMs - 600_000).replaceAll("&#x27;", "'");
    for (const word of gameTileTitleLines("live_trivia")) expect(html).toContain(`>${word}<`);
    expect(html).toContain(VENUE_HUB_TILE_SUBTITLE_BY_KEY.live_trivia);
    expect(html).toContain(GAME_TILE_THEMES.live_trivia.surfaceClass);
    expect(html).toMatch(/aria-hidden="true"[^>]*style="width:836px/);
  });

  it("names Round 1 only when the category is known (D13)", () => {
    expect(render(startMs - 600_000)).toContain("Round 1: History");
    expect(render(startMs - 600_000, makeState(null))).not.toContain("Round 1");
  });

  it("beats under five minutes, not before", () => {
    expect(render(startMs - 299_000)).toContain('data-testid="pregame-heartbeat"');
    expect(render(startMs - 301_000)).not.toContain('data-testid="pregame-heartbeat"');
  });

  it("has no ads, polling or storage of its own", () => {
    const src = readFileSync("components/venue-screen/TvLiveTriviaPregame.tsx", "utf8");
    expect(src).not.toMatch(/fetch\(|setInterval|localStorage|\/api\//);
  });
});

describe("the shared tile face", () => {
  const phone = readFileSync("components/venue/VenueGamesPanel.tsx", "utf8");
  const tv = readFileSync("components/venue-screen/TvLiveTriviaPregame.tsx", "utf8");

  it("renders on the phone's button and the TV's replica, from one component", () => {
    expect(phone).toContain("<GameTileFace");
    expect(tv).toContain("<GameTileFace");
    // Neither side draws the theme's art or title itself any more.
    expect(phone).not.toContain("theme.renderTitle");
    expect(phone).not.toContain("theme.art");
    expect(tv).not.toContain("theme.renderTitle");
    expect(tv).not.toContain("theme.art");
  });

  it("is Tailwind only", () => {
    expect(readFileSync("components/game-themes/GameTileFace.tsx", "utf8")).not.toMatch(/style=\{\{/);
  });
});

describe("the client", () => {
  const client = readFileSync("components/venue-screen/VenueScreenClient.tsx", "utf8");

  it("renders the real pre-game screen, not the Phase 2 placeholder", () => {
    expect(client).toContain("<TvLiveTriviaPregame");
    expect(client).not.toContain("LiveTriviaPregamePanel");
  });

  it("keeps the go-live detection and the entrance moment key", () => {
    expect(client).toContain("const flippedLive = isGoLiveTransition(previousMode, json.mode);");
    expect(readFileSync("components/venue-screen/TvLiveTriviaPregame.tsx", "utf8")).toContain("useFxMoment(`pregame:${gameId}`)");
  });
});

describe("the app QR is never covered, and settles on weak TVs", () => {
  const pregame = readFileSync("components/venue-screen/TvLiveTriviaPregame.tsx", "utf8");
  const idle = readFileSync("components/venue-screen/TvIdleAttract.tsx", "utf8");
  const client = readFileSync("components/venue-screen/VenueScreenClient.tsx", "utf8");

  it("keeps the stage twinkles (a canvas above the stage) off the idle and pre-game screens", () => {
    expect(client).toContain(
      'introPlaying || state.mode === "idle" || state.mode === "live-trivia-pregame" ? null : <StageTwinkles />',
    );
  });

  it("lifts the pre-game QR above the entrance streak", () => {
    expect(pregame).toMatch(/<div className="relative z-20">\s*<AppDownloadQr/);
  });

  it("stops the heartbeat, halo and rings at effects tier off", () => {
    expect(pregame).toContain('const still = Boolean(reduceMotion) || tier === "off";');
    expect(idle).toContain('const qrStill = Boolean(reduceMotion) || tier === "off";');
    expect(idle).not.toMatch(/animate=\{reduceMotion \? undefined : \{ (opacity: \[0\.55|scale: \[1, 1\.26\])/);
  });
});
