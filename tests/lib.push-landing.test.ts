import { describe, expect, it } from "vitest";
import {
  signInListPath,
  venuePanelFromSearch,
  venuePushLanding,
  venuePushPanelFromValue,
  venuePushPath,
  withVenuePanel,
} from "@/lib/pushLanding";

describe("venue push landing (away-mode plan, Phase C2)", () => {
  it("builds one path per screen", () => {
    expect(venuePushPath("venue-pacific-street", "games")).toBe("/venue/venue-pacific-street?panel=games");
    expect(venuePushPath("a b", "prizes")).toBe("/venue/a%20b?panel=prizes");
  });

  it("maps games to screen 0 and prizes to screen 2; anything else is ignored", () => {
    expect(venuePanelFromSearch("panel=games")).toBe(0);
    expect(venuePanelFromSearch("?panel=prizes&x=1")).toBe(2);
    for (const search of ["", "panel=leaderboard", "panel=2", "message=abc"]) {
      expect(venuePanelFromSearch(search), search).toBeNull();
    }
  });

  it("reads the bar and screen back from a tapped path", () => {
    expect(venuePushLanding(venuePushPath("a b", "prizes"))).toEqual({ venueId: "a b", panel: 2 });
    expect(venuePushLanding("/venue/v1?panel=games")).toEqual({ venueId: "v1", panel: 0 });
    expect(venuePushLanding("/venue/v1")).toBeNull();
    expect(venuePushLanding("/venue/v1?message=m1")).toBeNull();
    expect(venuePushLanding("/redeem-prizes?panel=games")).toBeNull();
    expect(venuePushLanding("/venue/%E0%A4%A?panel=games")).toBeNull();
  });
});

describe("the screen survives the sign-in list (away-mode plan, Phase R3)", () => {
  it("signInListPath keeps a known panel and nothing else", () => {
    expect(signInListPath("bar-b", "?panel=prizes&entryAt=1")).toBe("/?v=bar-b&panel=prizes");
    expect(signInListPath("bar-b", "panel=games")).toBe("/?v=bar-b&panel=games");
    expect(signInListPath("a b", "")).toBe("/?v=a%20b");
    expect(signInListPath("bar-b", "?panel=leaderboard")).toBe("/?v=bar-b");
  });

  it("finding 3: a prize push to bar B while signed in at A ends on B's Prizes screen", () => {
    // Push path → Venue Home B's mismatch redirect → sign-in list (`app/page.tsx` parses panel) → the hard
    // target navigateToResolvedVenue builds → VenuePanelFromUrl reads it.
    const pushPath = venuePushPath("bar-b", "prizes");
    const signInList = new URL(signInListPath("bar-b", new URL(pushPath, "https://x").search), "https://x");
    expect(signInList.searchParams.get("v")).toBe("bar-b");
    const initialPanel = venuePushPanelFromValue(signInList.searchParams.get("panel"));
    expect(initialPanel).toBe("prizes");
    const hardTarget = withVenuePanel("/venue/bar-b?entryUser=u1&entryVenue=bar-b&entryAt=1", initialPanel);
    expect(venuePanelFromSearch(new URL(hardTarget, "https://x").search)).toBe(2);
  });

  it("withVenuePanel adds nothing without a screen", () => {
    expect(withVenuePanel("/venue/v1?entryAt=1", null)).toBe("/venue/v1?entryAt=1");
    expect(venuePushPanelFromValue(" games ")).toBe("games");
    expect(venuePushPanelFromValue(undefined)).toBeNull();
  });
});
