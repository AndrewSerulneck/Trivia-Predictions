// Seasonal games (Super Bowl Squares, March Madness) — when their Venue Home cards show.
// Plan: docs/squares-and-brackets-plan.md, Phase 1. Plain data + pure date checks, safe on the
// server and the client: the high-traffic venue hub decides with ZERO extra requests.
//
// A card shows only when its flag is on AND today is inside its window. Each flag has one reader
// (below), same reversible convention as NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED: off (the default) = no
// card and every route of that game 404s, fully inert. A NEXT_PUBLIC_* flag is inlined at build
// time, so flipping one means env var, then redeploy.
//
// Do not turn a flag on before that game's route (/squares, /bracket) exists: the card links there.

import type { VenueGameKey } from "@/lib/venueGameCards";

export type SeasonalGameKey = Extract<VenueGameKey, "squares" | "bracket">;

const SEASONAL_GAME_KEYS: readonly SeasonalGameKey[] = ["squares", "bracket"];

export const isSeasonalGameKey = (key: string): key is SeasonalGameKey =>
  (SEASONAL_GAME_KEYS as readonly string[]).includes(key);

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/** Super Bowl Squares master flag. The single reader of NEXT_PUBLIC_SQUARES_ENABLED. */
export const isSquaresEnabled = (): boolean => truthy(process.env.NEXT_PUBLIC_SQUARES_ENABLED);

/** March Madness brackets master flag. The single reader of NEXT_PUBLIC_BRACKETS_ENABLED. */
export const isBracketsEnabled = (): boolean => truthy(process.env.NEXT_PUBLIC_BRACKETS_ENABLED);

export const isSeasonalGameEnabled = (key: SeasonalGameKey): boolean =>
  key === "squares" ? isSquaresEnabled() : isBracketsEnabled();

/**
 * Card windows as calendar dates (YYYY-MM-DD, inclusive), read on US Eastern time so the server
 * render and the phone agree. Andrew, 2026-10-19 (plan §1 decision 12): Squares Feb 1–15, 2027;
 * Brackets Mar 14–Apr 6, 2027, with an "Opens Selection Sunday" teaser card from Mar 1.
 * Roll these forward each season (plan Phase 11).
 */
export type SeasonalWindow = {
  /** First day the card shows as a teaser (not yet playable). Omit for no teaser. */
  teaserFrom?: string;
  /** First day the game is open. */
  opensOn: string;
  /** Last day the card shows. */
  closesAfter: string;
};

export const SEASONAL_GAME_WINDOWS: Record<SeasonalGameKey, SeasonalWindow> = {
  squares: { opensOn: "2027-02-01", closesAfter: "2027-02-15" },
  bracket: { teaserFrom: "2027-03-01", opensOn: "2027-03-14", closesAfter: "2027-04-06" },
};

export const SEASONAL_CALENDAR_TIME_ZONE = "America/New_York";

/** Squares: most squares one player may hold on a board (Andrew, 2026-10-19, decision 13). */
export const SQUARES_PER_PLAYER_CAP = 2;

const easternDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SEASONAL_CALENDAR_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar date on US Eastern time, as YYYY-MM-DD. */
export const seasonalCalendarDate = (now: Date): string => easternDateFormatter.format(now);

export type SeasonalCardState = "hidden" | "teaser" | "open";

/** Where a seasonal game's window stands on `now`, ignoring its flag. */
export const seasonalWindowState = (window: SeasonalWindow, now: Date): SeasonalCardState => {
  const today = seasonalCalendarDate(now);
  if (today > window.closesAfter) return "hidden";
  if (today >= window.opensOn) return "open";
  if (window.teaserFrom && today >= window.teaserFrom) return "teaser";
  return "hidden";
};

/** A seasonal game's card: hidden while its flag is off, else by its window. */
export const seasonalCardState = (key: SeasonalGameKey, now: Date): SeasonalCardState =>
  isSeasonalGameEnabled(key) ? seasonalWindowState(SEASONAL_GAME_WINDOWS[key], now) : "hidden";

/** Any Venue Home card: the year-round games are always open. */
export const venueHomeCardState = (key: VenueGameKey, now: Date): SeasonalCardState =>
  isSeasonalGameKey(key) ? seasonalCardState(key, now) : "open";
