import { isContinuousDefaultEnabled } from "@/lib/categoryBlitzShared";
import { BRACKET_GAME_NAME, SQUARES_EVENT_NAME, SQUARES_GAME_NAME } from "@/lib/venueGameCards";
import type { ChallengeGameType, OwnerScheduleGameType } from "@/types";

// Share to social designs (docs/partner-social-promo-plan.md §4.1, D13). ONE design per game, each
// with an optional prize panel — never a separate design per prize. A design is a registry entry, not
// a branch: the end-card layout (lib/promo/promoEndCard.ts) and the sheet never name a game id.
//
// Adding a schedulable game or a prize challenge for a new game = one entry here.
// tests/promo-coverage-contract.test.ts fails until every SUPPORTED_OWNER_SCHEDULE_GAME_TYPES entry and
// every REWARD_DEFINITIONS game has one.

export type PromoGameId = "live_trivia" | "category_blitz" | "pickem" | "nfl_pickem" | "squares" | "bracket";

export type PromoTemplate = {
  game: PromoGameId;
  /** The game's on-screen name: "Live Trivia". */
  name: string;
  /** The big title, one or two lines, upper case. The game's theme styles it (lib/promo/promoThemes.ts). */
  titleLines: readonly [string] | readonly [string, string];
  /** The design's accent, used by the Reel's beats (drumroll ring, confetti). Canvas colour, not a CSS token. */
  accent: string;
  /** The schedule engine this game is scheduled through, or null when partners don't schedule it. */
  scheduleGameType: OwnerScheduleGameType | null;
  /** The prize definitions' `gameType`s whose prizes can be shown on this design. */
  prizeGameTypes: readonly ChallengeGameType[];
  /**
   * The "when" line for a game partners don't schedule ("Make your picks every week"), and for a
   * schedulable game that runs without a schedule (Category Blitz, "Play any time"). Null = a schedule
   * is required to promote it.
   */
  standingWhen: string | null;
  /**
   * When the standing line is offered: "always" (an everyday game), "with-prize" (seasonal: only while
   * the venue offers a prize for it), or a check (Category Blitz: only while continuous play is on).
   */
  standingOffer: "always" | "with-prize" | (() => boolean);
  /** Caption hashtags, without "#". */
  hashtags: readonly string[];
  /** File-name slug: "hightop-live-trivia-post.jpg". */
  fileSlug: string;
};

export const PROMO_TEMPLATES: readonly PromoTemplate[] = [
  {
    game: "live_trivia",
    name: "Live Trivia",
    titleLines: ["LIVE", "TRIVIA"],
    // Cyan, as Andrew approved on the Phase 0 Reel (2026-11-03).
    accent: "#22D3EE",
    scheduleGameType: "live_trivia",
    prizeGameTypes: ["live-trivia"],
    standingWhen: null,
    standingOffer: "with-prize",
    hashtags: ["trivianight", "bartrivia", "livetrivia"],
    fileSlug: "live-trivia",
  },
  {
    game: "category_blitz",
    name: "Category Blitz",
    titleLines: ["CATEGORY", "BLITZ"],
    accent: "#4ADE80",
    scheduleGameType: "category_blitz",
    prizeGameTypes: [],
    standingWhen: "Play any time",
    standingOffer: isContinuousDefaultEnabled,
    hashtags: ["categoryblitz", "bargames", "gamenight"],
    fileSlug: "category-blitz",
  },
  {
    game: "pickem",
    name: "Pick 'Em",
    titleLines: ["PICK 'EM"],
    // Gold, as the approved game theme (docs/game-themes-plan.md G1).
    accent: "#FACC15",
    scheduleGameType: null,
    prizeGameTypes: ["pickem"],
    standingWhen: "Make your picks every week",
    standingOffer: "always",
    hashtags: ["pickem", "sportsbar", "gameday"],
    fileSlug: "pickem",
  },
  {
    game: "nfl_pickem",
    name: "NFL Pick 'Em",
    titleLines: ["NFL", "PICK 'EM"],
    accent: "#60A5FA",
    scheduleGameType: null,
    prizeGameTypes: ["nfl-pickem"],
    standingWhen: "Make your picks every week",
    standingOffer: "always",
    hashtags: ["nflpickem", "nfl", "sportsbar"],
    fileSlug: "nfl-pickem",
  },
  {
    game: "squares",
    name: SQUARES_GAME_NAME,
    titleLines: [SQUARES_EVENT_NAME.toUpperCase(), "SQUARES"],
    accent: "#FBBF24",
    scheduleGameType: null,
    prizeGameTypes: ["squares"],
    standingWhen: "Claim your square",
    standingOffer: "with-prize",
    hashtags: ["superbowlsquares", "superbowl", "sportsbar"],
    fileSlug: "squares",
  },
  {
    game: "bracket",
    name: BRACKET_GAME_NAME,
    // BRACKET_GAME_NAME ("March Madness") on two lines, so it stays big.
    titleLines: ["MARCH", "MADNESS"],
    accent: "#FB923C",
    scheduleGameType: null,
    prizeGameTypes: ["bracket"],
    standingWhen: "Fill out your bracket",
    standingOffer: "with-prize",
    hashtags: ["marchmadness", "bracket", "sportsbar"],
    fileSlug: "bracket",
  },
];

export const promoTemplateFor = (game: PromoGameId): PromoTemplate => {
  const template = PROMO_TEMPLATES.find((entry) => entry.game === game);
  if (!template) throw new Error(`No Share to social design for ${game}.`);
  return template;
};

/** The design that shows prizes for this prize `gameType`, or null (no design shows them). */
export const promoGameForPrizeGameType = (gameType: ChallengeGameType): PromoGameId | null =>
  PROMO_TEMPLATES.find((entry) => entry.prizeGameTypes.includes(gameType))?.game ?? null;

/** The design for a scheduled game. */
export const promoGameForSchedule = (gameType: OwnerScheduleGameType): PromoGameId | null =>
  PROMO_TEMPLATES.find((entry) => entry.scheduleGameType === gameType)?.game ?? null;
