import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Away mode + "Your bars" (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase C1 standing rule).
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const walk = (dir: string): string[] =>
  readdirSync(join(process.cwd(), dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(join(process.cwd(), path)).isDirectory() ? walk(path) : [path];
  });

// Every write a player makes at the bar keeps its server-side presence check. Away mode is view-only on
// the screen; these checks are what actually keep it view-only (VENUE_PRESENCE_ENFORCEMENT is on).
const PRESENCE_CHECKED_ROUTES = [
  "app/api/bingo/cards/route.ts",
  "app/api/category-blitz/rounds/[id]/submit/route.ts",
  "app/api/fantasy/entries/route.ts",
  "app/api/pickem/picks/route.ts",
  "app/api/pickem/prize-tiebreaker/route.ts",
  "app/api/predictions/route.ts",
  "app/api/prizes/redeem-challenge/route.ts",
  "app/api/prizes/square-gift-card/route.ts",
  "app/api/trivia/live/submit-answer/route.ts",
  "app/api/trivia/route.ts",
  // Added 2026-11-09 (Andrew): these three had only the on-screen block.
  "app/api/nfl-pickem/picks/route.ts",
  "app/api/squares/claim/route.ts",
  "app/api/bracket/entry/route.ts",
];

describe("away mode contract", () => {
  it("Category Blitz: a poll from a player not at the bar only looks, never starts a round", () => {
    const route = read("app/api/category-blitz/sessions/route.ts");
    expect(route).toContain("isVenuePresenceMutationEnforcementEnabled() &&");
    expect(route).toContain("!(resolvedUserId && (await isVenuePresenceLive({ userId: resolvedUserId, venueId })))");
    const lookOnly = route.slice(route.indexOf("isVenuePresenceMutationEnforcementEnabled() &&"), route.indexOf('if (searchParams.get("peek") === "1") {'));
    expect(lookOnly).toContain("buildPeekPayload({ roomId, venueId, now })");
    expect(route).toMatch(/buildPeekPayload = async[\s\S]*?peekCategoryBlitz\(roomId, now\)/);
    expect(lookOnly).not.toMatch(/drive(Continuous|Venue)CategoryBlitz|registerSessionPresence/);
  });

  it("keeps the presence check on every presence-checked write route", () => {
    for (const route of PRESENCE_CHECKED_ROUTES) {
      expect(read(route), route).toMatch(/await maybeRequireActiveVenuePresence(ForUser)?\(/);
    }
  });

  it("is turned on for Venue Home only; every game screen keeps the overlay", () => {
    const users = [...walk("app"), ...walk("components")]
      .filter((path) => /\.tsx?$/.test(path) && !path.endsWith("VenuePresenceBoundary.tsx"))
      .filter((path) => /<VenuePresenceBoundary[^>]*\bawayMode\b/.test(read(path)));
    expect(users).toEqual(["app/venue/[venueId]/page.tsx"]);
  });

  it("only being out of range is 'away'; every other failure keeps the overlay", () => {
    const boundary = read("components/venue/VenuePresenceBoundary.tsx");
    expect(boundary).toContain('return failure.code === "VENUE_OUT_OF_RANGE";');
    expect(boundary).toContain("if (awayMode && isVenueAwayFailure(failure)) {");
  });

  it("opens a game from Venue Home only through playWhenPresent", () => {
    const hub = read("components/venue/VenueHubClient.tsx");
    const goToCalls = hub.match(/void goTo\(/g) ?? [];
    const guardedCalls = hub.match(/playWhenPresent\(isAway, recheckLocation, \(\) =>\s*void goTo\(/g) ?? [];
    expect(guardedCalls.length).toBe(2);
    expect(goToCalls.length).toBe(guardedCalls.length);
    expect(hub).toContain('{isAway ? AWAY_PLAY_LABEL : "Play Now!"}');
  });

  it("opening a bar view-only never writes: no profile created, no presence recorded", () => {
    const lib = read("lib/playerVenues.ts");
    const route = read("app/api/player/venues/open/route.ts");
    for (const source of [lib, route]) {
      expect(source).not.toMatch(/\.(insert|upsert|update|delete)\(/);
      expect(source).not.toContain("recordVerifiedVenuePresence");
    }
  });

  it("trusts only the signed session, narrowed by the browser's player id", () => {
    expect(read("app/api/player/venues/route.ts")).toContain("readSession(request)");
    expect(read("app/api/player/venues/open/route.ts")).toContain("readSession(request)");
    expect(read("lib/playerVenues.ts")).toContain("if ((claimedUserId ?? \"\").trim() !== sessionUserId) return null;");
  });

  it("R3: the auto-open stamp is written after the session clear, and the screen rides in the URL", () => {
    const join = read("components/join/JoinFlow.tsx");
    const start = join.indexOf("const navigateToResolvedVenue = useCallback(");
    const helper = join.slice(start, join.indexOf("const resolveAndNavigate = useCallback(", start));
    const clearAt = helper.indexOf("hardClearAuthAndCachePreserveVenue(selectedVenue.id);");
    expect(clearAt).toBeGreaterThan(-1);
    expect(helper.indexOf("if (options?.automatic) markAwayAutoOpen(Date.now());")).toBeGreaterThan(clearAt);
    expect(helper.indexOf("savePlayerPanel(")).toBeGreaterThan(clearAt);
    expect(helper).toContain("withVenuePanel(");
    // The auto-open effect only reads the stamp; nothing else in the join flow touches its key.
    expect(join).toContain("if (!awayAutoOpenAllowed(Date.now())) return;");
    // R9: only after this sign-in's list was built from a real location, and the ref is set only for a chosen bar.
    const effect = join.slice(join.indexOf("awayAutoOpenTarget({"), join.indexOf("void handleOpenAwayVenue(target, { automatic: true });"));
    expect(effect).toContain("listBuilt: venueListState.builtForGeneration === venueListState.generation");
    expect(effect.indexOf("if (!target) return;")).toBeLessThan(effect.indexOf("autoOpenedAwayVenueRef.current = true;"));
    expect(join).not.toContain("ht:away-auto-open-at");
    expect(join.match(/markAwayAutoOpen\(/g)?.length).toBe(1);
    // Every Venue Home redirect to the sign-in list keeps the push's screen.
    const hub = read("components/venue/VenueHubClient.tsx");
    expect(hub).not.toMatch(/`\/\?v=/);
    expect(hub.match(/signInListPath\(venue\.id, mountSearchRef\.current\)/g)?.length).toBe(5);
    expect(read("app/page.tsx")).toContain("initialPanel=");
    // Never by exempting keys from the sign-out clear.
    expect(read("lib/storage.ts")).not.toContain("ht:away-auto-open-at");
  });
});
