import { describe, expect, it } from "vitest";
import {
  commitJoinVenueList,
  emptyJoinVenueList,
  filterVenuesInRange,
  INITIAL_JOIN_VENUE_LIST,
  visibleJoinVenueList,
  type JoinVenueListState,
} from "@/lib/joinVenueList";
import type { Venue } from "@/types";

// Phase 2C (docs/native-app-store-plan.md, device report R4). These tests drive
// the same state transitions JoinFlow makes (beginVenueListBuild →
// emptyJoinVenueList, commitVenueList → commitJoinVenueList, render →
// visibleJoinVenueList); tests/god-mode-join-contract.test.ts pins that
// JoinFlow makes them in that order.

const venue = (id: string, latitude: number, longitude: number): Venue => ({
  id,
  name: id,
  latitude,
  longitude,
  radius: 100,
});

// The player stands at Pacific Street-ish NYC coordinates.
const HERE = { latitude: 40.6803, longitude: -73.9755, accuracy: 20 };
const NEARBY = venue("nearby", 40.6806, -73.9752); // ~40 m away
const ACROSS_TOWN = venue("across-town", 40.758, -73.9855); // ~8.7 km away
const OTHER_STATE = venue("other-state", 39.9526, -75.1652); // Philadelphia
const ALL_VENUES = [ACROSS_TOWN, NEARBY, OTHER_STATE];

// Mirrors JoinFlow: the generation ref is the authority; state follows it.
const makeJoinFlowModel = () => {
  let generationRef = INITIAL_JOIN_VENUE_LIST.generation;
  let state: JoinVenueListState = INITIAL_JOIN_VENUE_LIST;
  const begin = () => {
    generationRef += 1;
    state = emptyJoinVenueList(generationRef);
    return generationRef;
  };
  return {
    begin,
    discard: () => {
      begin();
    },
    commit: (generation: number, venues: Venue[]) => {
      if (generation !== generationRef) return false;
      state = commitJoinVenueList(state, generation, venues);
      return true;
    },
    visible: () => visibleJoinVenueList(state),
  };
};

describe("filterVenuesInRange", () => {
  it("keeps only in-range venues", () => {
    expect(filterVenuesInRange(ALL_VENUES, HERE).map((item) => item.id)).toEqual(["nearby"]);
  });

  it("sorts the in-range venues nearest first", () => {
    const alsoNearby = venue("also-nearby", 40.6812, -73.9755); // ~100 m
    expect(filterVenuesInRange([alsoNearby, NEARBY], HERE).map((item) => item.id)).toEqual([
      "nearby",
      "also-nearby",
    ]);
  });

  it("returns nothing when no venue is in range", () => {
    expect(filterVenuesInRange([ACROSS_TOWN, OTHER_STATE], HERE)).toEqual([]);
  });
});

describe("join venue list across sign-ins", () => {
  it("God Mode signs out, a normal player signs up: nothing shows until location resolves, then only in-range venues", () => {
    const flow = makeJoinFlowModel();

    // God Mode (Rick) signs in: every venue, no location check.
    const godBuild = flow.begin();
    flow.commit(godBuild, ALL_VENUES);
    expect(flow.visible()).toHaveLength(3);

    // Sign out (handleSignedOut → discardVenueList).
    flow.discard();
    expect(flow.visible()).toEqual([]);

    // A new normal player signs up; the builder starts and awaits location.
    const playerBuild = flow.begin();
    expect(flow.visible()).toEqual([]);

    // Location resolves.
    flow.commit(playerBuild, filterVenuesInRange(ALL_VENUES, HERE));
    expect(flow.visible().map((item) => item.id)).toEqual(["nearby"]);
  });

  it("drops a God Mode build that finishes after the next sign-in's build started", () => {
    const flow = makeJoinFlowModel();
    const godBuild = flow.begin(); // still awaiting listVenues()…
    flow.discard(); // …when the account signs out
    const playerBuild = flow.begin();

    expect(flow.commit(godBuild, ALL_VENUES)).toBe(false);
    expect(flow.visible()).toEqual([]);

    flow.commit(playerBuild, filterVenuesInRange(ALL_VENUES, HERE));
    expect(flow.visible().map((item) => item.id)).toEqual(["nearby"]);
  });

  it("back to the sign-in choice drops the list too", () => {
    const flow = makeJoinFlowModel();
    flow.commit(flow.begin(), ALL_VENUES);
    flow.discard(); // handleBackToAuthMethodSelection
    expect(flow.visible()).toEqual([]);
  });

  it("a location retry empties the list while it runs", () => {
    const flow = makeJoinFlowModel();
    flow.commit(flow.begin(), [NEARBY]);
    const retry = flow.begin(); // handleGrantLocation("venue-list")
    expect(flow.visible()).toEqual([]);
    flow.commit(retry, [NEARBY]);
    expect(flow.visible()).toEqual([NEARBY]);
  });

  it("direct venue link: a fresh page shows no list before the post-auth build commits", () => {
    // The deep-link load path no longer writes the list at all, so the first
    // thing the venue-list panel can show is the post-auth build's result.
    const flow = makeJoinFlowModel();
    expect(flow.visible()).toEqual([]);
    const playerBuild = flow.begin();
    expect(flow.visible()).toEqual([]);
    flow.commit(playerBuild, filterVenuesInRange(ALL_VENUES, HERE));
    expect(flow.visible().map((item) => item.id)).toEqual(["nearby"]);
  });
});

describe("visibleJoinVenueList (render guard)", () => {
  it("shows nothing for a list that was not built for the current generation", () => {
    const stale: JoinVenueListState = { generation: 4, builtForGeneration: 3, venues: ALL_VENUES };
    expect(visibleJoinVenueList(stale)).toEqual([]);
  });

  it("refuses a commit for an older generation", () => {
    const current = emptyJoinVenueList(5);
    expect(commitJoinVenueList(current, 4, ALL_VENUES)).toBe(current);
  });

  it("starts empty", () => {
    expect(visibleJoinVenueList(INITIAL_JOIN_VENUE_LIST)).toEqual([]);
  });
});
