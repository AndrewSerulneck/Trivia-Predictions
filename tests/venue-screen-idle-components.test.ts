import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatIdleCountdown, IdleVenueScreen } from "@/components/venue-screen/IdleVenueScreen";
import { APP_DOWNLOAD_DISPLAY_URL, APP_DOWNLOAD_URL } from "@/lib/appDownloadLink";
import type { VenueScreenState } from "@/lib/venueScreen";

type IdleState = Extract<VenueScreenState, { mode: "idle" }>;

const nowMs = Date.parse("2026-07-02T20:00:00.000Z");

function makeIdleState(overrides: Partial<IdleState["idle"]> = {}): IdleState {
  return {
    ok: true,
    mode: "idle",
    venue: {
      id: "venue-1",
      name: "Hightop Pub",
      displayName: "Hightop Pub TV",
      screenBrandImageUrl: "https://cdn.example.com/hightop-pub.png",
      screenBrandPrimary: "#14b8a6",
      screenBrandSecondary: "#f59e0b",
    },
    liveTrivia: null,
    categoryBlitz: null,
    idle: {
      nextLiveTrivia: {
        startsAt: "2026-07-02T21:00:00.000Z",
        title: "Thursday Live Trivia",
        firstRoundCategory: "History",
        recurringDays: ["thu"],
      },
      sponsorSlots: [],
      ...overrides,
    },
    updatedAt: nowMs,
  };
}

const render = (state = makeIdleState()) =>
  renderToStaticMarkup(React.createElement(IdleVenueScreen, { state, nowMs }));

describe("Idle venue screen components", () => {
  it("is an app-download screen: Get the app, the permanent short link, the venue name once", () => {
    const html = render();

    expect(html).toContain("Get the app");
    expect(html).toContain(APP_DOWNLOAD_DISPLAY_URL);
    expect(html).toContain('data-testid="app-download-qr"');
    expect(html).toContain("Hightop");
    expect(html.match(/Hightop Pub TV/g)?.length).toBe(1);
  });

  it("draws the QR for the permanent app link, white plate, no motion on it", () => {
    const qr = render().split('data-testid="app-download-qr"')[1] ?? "";
    expect(qr).toContain("<svg");
    expect(qr).toContain('fill="#ffffff"');
    expect(qr).not.toMatch(/animate|transform|opacity/i);
    expect(APP_DOWNLOAD_URL).toBe("https://hightopchallenge.com/app");
  });

  it("drops the carousel, the tagline and every Category Blitz card (Andrew 2026-11-14)", () => {
    const html = render(makeIdleState());
    expect(html).not.toContain("Next up");
    expect(html).not.toContain("Category Blitz");
    expect(html).not.toContain("Play anytime");
    expect(html).not.toContain("Start it on your phone");
    expect(html).not.toContain("Grab a table");
  });

  it("renders the same markup with or without a scheduled game (the small line is device-time text, added after hydration)", () => {
    expect(render()).toBe(render(makeIdleState({ nextLiveTrivia: null })));
  });

  it("formats longer idle countdowns for large TV display", () => {
    expect(formatIdleCountdown(null)).toBe("Schedule coming soon");
    expect(formatIdleCountdown(45)).toBe("0:45");
    expect(formatIdleCountdown(3_661)).toBe("1:01:01");
    expect(formatIdleCountdown(93_600)).toBe("1d 02h");
  });
});
