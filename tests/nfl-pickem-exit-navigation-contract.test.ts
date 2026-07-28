import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Static tripwire for the Phase 4 fix (docs/nfl-pickem-phase4.md).
//
// The exit chevron used to bounce the user straight back into the game: the
// games-loading effect subscribed to `searchParams` *and* called
// `router.replace("/nfl-pickem?week=...")` from inside itself. That is a
// self-retriggering navigation, and a replace still pending when the user
// tapped back fired after the push to /venue/<id>, re-mounting the landing
// experience in its non-playing (tutorial) state.
//
// These assertions fail if either half of that shape comes back.

const gameListSource = readFileSync(
  path.resolve(process.cwd(), "components/nfl-pickem/NFLPickEmGameList.tsx"),
  "utf8"
);
const pageSource = readFileSync(
  path.resolve(process.cwd(), "app/nfl-pickem/page.tsx"),
  "utf8"
);

const loadGamesEffect = (() => {
  const start = gameListSource.indexOf("  // Load games when week changes");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = gameListSource.indexOf("loadGames();", start);
  expect(end).toBeGreaterThan(start);
  return gameListSource.slice(start, gameListSource.indexOf("\n", end));
})();

describe("NFL Pick 'Em exit-navigation contract", () => {
  it("never navigates from inside the games-loading effect", () => {
    expect(loadGamesEffect).not.toContain("router.replace");
    expect(loadGamesEffect).not.toContain("router.push");
  });

  it("does not subscribe the games-loading effect to the URL", () => {
    expect(loadGamesEffect).not.toContain("searchParams");
    expect(gameListSource).toContain("}, [selectedWeekId, userId, venueId]);");
    // useSearchParams() would re-subscribe the whole component to its own
    // ?week= writes; the initial week arrives as a server-resolved prop.
    expect(gameListSource).not.toContain("useSearchParams()");
  });

  it("syncs ?week= from the user action instead", () => {
    expect(gameListSource).toContain("const handleSelectWeek = useCallback((weekId: string) => {");
    expect(gameListSource).toContain("onSelect={handleSelectWeek}");
  });

  it("routes the app bar exit through GameLandingExperience's backToVenue", () => {
    expect(gameListSource).toContain("<GameAppBar game=\"nfl-pickem\" onExit={onBack} />");
    // GameLandingExperience only clones `onBack` into its child when
    // showPlayingBackButton is on (it defaults to true and renders no control
    // of its own, so this must not be disabled here).
    expect(pageSource).not.toContain("showPlayingBackButton={false}");
  });
});
