import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPrizeStorySharePayload } from "@/lib/socialShare/storyPayloads";
import { STORY_SHARE_GAME_TYPES } from "@/lib/socialShare/shareGames";

// Native-app plan Phase 9c: "Share my win" on every win screen. Static tripwire, like
// tests/native-back-review-fixes.test.ts: a win screen that loses its button, a button that starts
// making requests, or a prize picture that could carry a redeemable thing, fails here.

const root = path.resolve(__dirname, "..");
const read = (file: string): string => fs.readFileSync(path.join(root, file), "utf8");

/** Every screen that must offer the button, and the share game it offers. */
const WIN_SCREENS: Array<{ file: string; match: RegExp }> = [
  { file: "components/prizes/PrizeWalletPanel.tsx", match: /<ShareWinButton prize=\{prizeCardFace\(/ },
  { file: "components/bingo/BingoBoardCard.tsx", match: /<ShareWinButton gameType="bingo"/ },
  { file: "components/pickem/PickEmGameList.tsx", match: /<ShareWinButton gameType="pickem"/ },
  { file: "components/nfl-pickem/NFLPickEmLeaderboard.tsx", match: /gameType="nfl-pickem"/ },
  { file: "components/fantasy/FantasyHome.tsx", match: /gameType="fantasy"/ },
  { file: "components/squares/SquaresGame.tsx", match: /<ShareWinButton gameType="squares"/ },
  { file: "components/bracket/BracketStandings.tsx", match: /<ShareWinButton gameType="bracket"/ },
];

describe("Phase 9c — Share my win", () => {
  it.each(WIN_SCREENS)("$file offers the button", ({ file, match }) => {
    const source = read(file);
    expect(source).toContain("ShareWinButton");
    expect(source).toMatch(match);
  });

  it("Live Trivia and Category Blitz keep their own launcher", () => {
    expect(read("app/trivia/live/page.tsx")).toContain("StoryShareLauncher");
    expect(read("components/category-blitz/CategoryBlitzGame.tsx")).toContain("StoryShareLauncher");
  });

  it("the button makes no request of its own and holds no redeemable thing", () => {
    const source = read("components/social-share/ShareWinButton.tsx");
    expect(source).not.toMatch(/fetch\(|supabase|setInterval|setTimeout/);
    expect(source).not.toMatch(/redeem|couponCode|redeemCode|qrValue|giftCardNumber|\bgan\b/i);
  });

  it("a seasonal result button sits only on a screen that is itself flag-gated", () => {
    // /squares and /bracket call notFound() with the flag off, so their buttons can't show.
    expect(read("app/bracket/page.tsx")).toMatch(/notFound\(\)/);
    expect(read("app/squares/page.tsx")).toMatch(/notFound\(\)/);
  });

  it("a prize picture carries the prize name only, never a coupon code or card number", () => {
    const winWithSecrets = {
      headline: "$15",
      headlineKind: "amount" as const,
      label: "GIFT CARD" as const,
      redeemCode: "HT-SECRET-1234",
      squareGan: "7783320001001234",
      qr: "https://example.test/redeem/abc",
    };
    const payload = buildPrizeStorySharePayload({
      venueId: "v1",
      venueName: "The Pour House",
      userId: "u1",
      username: "ace",
      prize: winWithSecrets,
    });
    const json = JSON.stringify(payload);
    expect(json).not.toContain("HT-SECRET-1234");
    expect(json).not.toContain("7783320001001234");
    expect(json).not.toContain("example.test");
    expect(payload.prize).toEqual({ headline: "$15", headlineKind: "amount", label: "GIFT CARD" });
  });

  it("share analytics accept every game in the share registry (route and migration)", () => {
    expect(read("app/api/analytics/events/route.ts")).toContain("STORY_SHARE_GAME_TYPES");
    const migrations = fs
      .readdirSync(path.join(root, "supabase/migrations"))
      .filter((name) => name.includes("story_share_events"))
      .sort();
    const latest = read(`supabase/migrations/${migrations[migrations.length - 1]}`);
    for (const gameType of STORY_SHARE_GAME_TYPES) {
      expect(latest).toContain(`'${gameType}'`);
    }
  });
});
