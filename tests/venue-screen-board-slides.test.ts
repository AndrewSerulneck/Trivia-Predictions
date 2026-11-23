import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IdleVenueScreen } from "@/components/venue-screen/IdleVenueScreen";
import { TvAllTimeLeaderboard } from "@/components/venue-screen/TvAllTimeLeaderboard";
import { TvPickEmBoard } from "@/components/venue-screen/TvPickEmBoard";
import type { VenueScreenState } from "@/lib/venueScreen";
import { debugCarousel, EMPTY_CAROUSEL } from "@/lib/venueScreenCarouselShared";
import { parseVenueScreenPreviewSlide } from "@/lib/venueScreenTiming";

type IdleState = Extract<VenueScreenState, { mode: "idle" }>;

const NOW = Date.parse("2026-11-22T18:00:00.000Z");
const data = debugCarousel("sunday", NOW);

const idleState = (carousel = data): IdleState => ({
  ok: true,
  mode: "idle",
  venue: { id: "v1", name: "The Rusty Anchor", displayName: null, screenBrandImageUrl: null, screenBrandPrimary: null, screenBrandSecondary: null },
  liveTrivia: null,
  categoryBlitz: null,
  idle: { nextLiveTrivia: null, sponsorSlots: [], ...carousel },
  updatedAt: NOW,
});

const board = () =>
  renderToStaticMarkup(
    React.createElement(TvPickEmBoard, {
      venueName: "The Rusty Anchor",
      games: data.pickEm?.games ?? [],
      leaders: data.pickEm?.leaders ?? null,
      nowMs: NOW,
    }),
  );

describe("Pick 'Em Live Board slide", () => {
  it("draws four tiles with a league on each, the top 5 and the venue", () => {
    const html = board();
    expect(html.match(/data-testid="pickem-tile"/g)).toHaveLength(4);
    expect(html).toContain("Pick &#x27;Em Live");
    expect(html).toContain("The Rusty Anchor");
    expect(html.match(/data-testid="pickem-leader"/g)).toHaveLength(5);
    expect(html).toContain("Top 5 here");
    expect(html).toContain("9–3");
    expect(html.match(/>NFL</g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("has no join QR and leaves the ticker, dots and QR corner to Phase 11", () => {
    const html = board();
    expect(html).not.toContain("app-download-qr");
    expect(html).not.toContain("Scan to play");
    expect(html).not.toContain("<svg");
  });

  it("shows no flash on the first render, and a quiet side column when nobody has a settled pick", () => {
    expect(board()).not.toContain("pickem-ribbon");
    const html = renderToStaticMarkup(
      React.createElement(TvPickEmBoard, { venueName: "X", games: data.pickEm?.games ?? [], leaders: null, nowMs: NOW }),
    );
    expect(html).toContain("pickem-no-leaders");
  });

  it("never prints an unknown score as 0", () => {
    const scheduled = (data.pickEm?.games ?? []).filter((g) => g.status === "scheduled").slice(0, 1);
    const html = renderToStaticMarkup(
      React.createElement(TvPickEmBoard, { venueName: "X", games: scheduled, leaders: null, nowMs: NOW }),
    );
    expect(html).toContain("–");
    expect(html).not.toMatch(/>0</);
  });
});

describe("All-Time Leaderboard slide", () => {
  const html = renderToStaticMarkup(
    React.createElement(TvAllTimeLeaderboard, { venueName: "The Rusty Anchor", entries: data.allTimeLeaderboard ?? [] }),
  );

  it("shows ten rows with thousands separators and pts", () => {
    expect(html.match(/data-testid="alltime-row"/g)).toHaveLength(10);
    expect(html).toContain("48,210");
    expect(html).toContain("25,190");
    expect(html).toContain("pts");
    expect(html).toContain("All-Time Leaderboard");
  });

  it("makes only #1 gold", () => {
    expect(html.match(/rgba\(252,211,77,0\.32\)/g)).toHaveLength(1);
  });

  it("has no QR of its own (Phase 11's shared corner owns it)", () => {
    expect(html).not.toContain("app-download-qr");
  });
});

describe("idle preview", () => {
  const render = (previewSlide: "pick-em" | "all-time" | null, state = idleState()) =>
    renderToStaticMarkup(React.createElement(IdleVenueScreen, { state, nowMs: NOW, previewSlide }));

  it("pins a slide only when asked; otherwise the idle screen is unchanged", () => {
    expect(render("pick-em")).toContain("tv-pickem-board");
    expect(render("all-time")).toContain("tv-alltime-leaderboard");
    expect(render(null)).toContain("Get the app");
    expect(render(null)).not.toContain("tv-pickem-board");
  });

  it("falls back to the idle screen when the slide has no data", () => {
    expect(render("pick-em", idleState(EMPTY_CAROUSEL))).toContain("Get the app");
  });

  it("reads ?slide= only with a carousel debug mode", () => {
    expect(parseVenueScreenPreviewSlide("pick-em", "carousel")).toBe("pick-em");
    expect(parseVenueScreenPreviewSlide(["all-time"], "carousel-weeknight")).toBe("all-time");
    expect(parseVenueScreenPreviewSlide("pick-em", null)).toBeNull();
    expect(parseVenueScreenPreviewSlide("pick-em", "idle")).toBeNull();
    expect(parseVenueScreenPreviewSlide("nope", "carousel")).toBeNull();
  });
});
