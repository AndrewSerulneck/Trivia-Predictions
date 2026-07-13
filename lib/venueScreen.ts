import "server-only";

import { driveVenueCategoryBlitz, getRoundResults } from "@/lib/categoryBlitz";
import { getNextScheduleOccurrence, listSchedules } from "@/lib/categoryBlitzSchedules";
import { lobbyDwellSeconds } from "@/lib/categoryBlitzShared";
import { getLiveShowdownState, type LiveShowdownState } from "@/lib/liveShowdownEngine";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueScreenPollIntervalMs } from "@/lib/venueScreenTiming";
import { getVenueById } from "@/lib/venues";
import type { CategoryBlitzRound, CategoryBlitzSession, Venue } from "@/types";

export type ScreenLeaderboardEntry = {
  rank: number;
  username: string;
  points: number;
};

export type VenueScreenSponsorSlot = {
  title: string;
  imageUrl: string;
  linkUrl?: string | null;
};

export type VenueScreenVenue = {
  id: string;
  name: string;
  displayName?: string | null;
  screenBrandImageUrl?: string | null;
  screenBrandPrimary?: string | null;
  screenBrandSecondary?: string | null;
};

export type VenueScreenState =
  | {
      ok: true;
      mode: "live-trivia";
      venue: VenueScreenVenue;
      liveTrivia: {
        phase: "question" | "intermission" | "final";
        roundNumber: number | null;
        totalRounds: number;
        category: string | null;
        question: string | null;
        secondsRemaining: number;
        leaderboard: ScreenLeaderboardEntry[] | null;
      };
      categoryBlitz: null;
      idle: null;
      updatedAt: number;
    }
  | {
      ok: true;
      mode: "category-blitz";
      venue: VenueScreenVenue;
      liveTrivia: null;
      categoryBlitz: {
        phase: "round" | "intermission" | "results";
        roundId: string | null;
        letter: string | null;
        categories: string[];
        secondsRemaining: number;
        leaderboard: ScreenLeaderboardEntry[] | null;
      };
      idle: null;
      updatedAt: number;
    }
  | {
      ok: true;
      mode: "idle";
      venue: VenueScreenVenue;
      liveTrivia: null;
      categoryBlitz: null;
      idle: {
        nextLiveTrivia: {
          startsAt: string;
          title: string;
          firstRoundCategory?: string | null;
          recurringDays?: string[];
        } | null;
        nextCategoryBlitz: {
          startsAt: string;
          recurringDays?: string[];
        } | null;
        sponsorSlots: VenueScreenSponsorSlot[];
      };
      updatedAt: number;
    };

export type VenueScreenCategoryBlitzInput = {
  session: CategoryBlitzSession | null;
  round: CategoryBlitzRound | null;
  leaderboard: ScreenLeaderboardEntry[] | null;
  nextStartsAt: string | null;
  nextRecurringDays?: string[];
};

export type VenueScreenSelectionInput = {
  venue: VenueScreenVenue;
  liveTrivia: LiveShowdownState;
  categoryBlitz: VenueScreenCategoryBlitzInput;
  idle?: {
    sponsorSlots?: VenueScreenSponsorSlot[];
  };
  updatedAt: number;
};

type VenueScreenBrandingRow = {
  screen_enabled: boolean | null;
  screen_brand_image_url: string | null;
  screen_brand_primary: string | null;
  screen_brand_secondary: string | null;
  screen_sponsor_rotation_enabled: boolean | null;
};

export type VenueScreenSponsorRow = {
  title: string | null;
  image_url: string | null;
  link_url: string | null;
  display_order: number | null;
  starts_at: string | null;
  ends_at: string | null;
};

type CategoryBlitzRoundRow = {
  id: string;
  session_id: string;
  venue_id: string;
  letter: string;
  category_set_index: number;
  categories: string[];
  started_at: string;
  ends_at: string;
  status: string;
  created_at: string;
  scored_at: string | null;
  mode: string;
};

function optionalTrim(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function normalizeBrandColor(value: unknown): string | null {
  const trimmed = optionalTrim(value);
  if (!trimmed) return null;
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : null;
}

function isMissingScreenSchemaError(errorMessage: string | undefined): boolean {
  const normalized = String(errorMessage ?? "").toLowerCase();
  return (
    normalized.includes("could not find the table") ||
    (normalized.includes("relation") && normalized.includes("does not exist")) ||
    (normalized.includes("column") && normalized.includes("does not exist")) ||
    normalized.includes("schema cache")
  );
}

function toScreenVenue(
  venue: Venue,
  branding: Partial<Pick<VenueScreenVenue, "screenBrandImageUrl" | "screenBrandPrimary" | "screenBrandSecondary">> = {},
): VenueScreenVenue {
  const rowLikeVenue = venue as Venue & {
    screenBrandImageUrl?: string | null;
    screenBrandPrimary?: string | null;
    screenBrandSecondary?: string | null;
  };

  return {
    id: venue.id,
    name: venue.name,
    displayName: venue.displayName ?? null,
    screenBrandImageUrl: optionalTrim(branding.screenBrandImageUrl ?? rowLikeVenue.screenBrandImageUrl),
    screenBrandPrimary: normalizeBrandColor(branding.screenBrandPrimary ?? rowLikeVenue.screenBrandPrimary),
    screenBrandSecondary: normalizeBrandColor(branding.screenBrandSecondary ?? rowLikeVenue.screenBrandSecondary),
  };
}

function toLeaderboard(entries: Array<{ rank?: number; username?: string | null; totalPoints?: number; points?: number }>): ScreenLeaderboardEntry[] {
  return entries
    .map((entry, index) => ({
      rank: Number.isFinite(Number(entry.rank)) ? Math.max(1, Math.floor(Number(entry.rank))) : index + 1,
      username: String(entry.username ?? "").trim() || "Unknown",
      points: Math.max(0, Math.floor(Number(entry.points ?? entry.totalPoints ?? 0))),
    }))
    .slice(0, 10);
}

function secondsUntil(iso: string | null | undefined, nowMs: number): number {
  const targetMs = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(targetMs)) return 0;
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
}

function mapCategoryBlitzRound(row: CategoryBlitzRoundRow): CategoryBlitzRound {
  return {
    id: row.id,
    sessionId: row.session_id,
    venueId: row.venue_id,
    letter: row.letter,
    categorySetIndex: row.category_set_index,
    categories: Array.isArray(row.categories) ? row.categories : [],
    startedAt: row.started_at,
    endsAt: row.ends_at,
    status: row.status as CategoryBlitzRound["status"],
    createdAt: row.created_at,
    scoredAt: row.scored_at,
    mode: (row.mode === "reverse" ? "reverse" : "standard"),
  };
}

export function mapVenueScreenSponsorRows(
  rows: VenueScreenSponsorRow[],
  nowMs: number,
): VenueScreenSponsorSlot[] {
  return rows
    .filter((row) => {
      const imageUrl = optionalTrim(row.image_url);
      const title = optionalTrim(row.title);
      if (!imageUrl || !title) return false;

      const startsAtMs = row.starts_at ? Date.parse(row.starts_at) : Number.NaN;
      const endsAtMs = row.ends_at ? Date.parse(row.ends_at) : Number.NaN;
      const hasStarted = !row.starts_at || !Number.isFinite(startsAtMs) || startsAtMs <= nowMs;
      const hasNotEnded = !row.ends_at || !Number.isFinite(endsAtMs) || endsAtMs >= nowMs;
      return hasStarted && hasNotEnded;
    })
    .sort((a, b) => {
      const orderA = Number.isFinite(Number(a.display_order)) ? Number(a.display_order) : 0;
      const orderB = Number.isFinite(Number(b.display_order)) ? Number(b.display_order) : 0;
      return orderA - orderB;
    })
    .map((row) => ({
      title: optionalTrim(row.title) ?? "Sponsor",
      imageUrl: optionalTrim(row.image_url) ?? "",
      linkUrl: optionalTrim(row.link_url),
    }))
    .slice(0, 6);
}

async function getVenueScreenBranding(
  venueId: string,
): Promise<{
  screenEnabled: boolean;
  screenSponsorRotationEnabled: boolean;
  branding: Partial<Pick<VenueScreenVenue, "screenBrandImageUrl" | "screenBrandPrimary" | "screenBrandSecondary">>;
}> {
  if (!supabaseAdmin) {
    return { screenEnabled: true, screenSponsorRotationEnabled: false, branding: {} };
  }

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("screen_enabled, screen_brand_image_url, screen_brand_primary, screen_brand_secondary, screen_sponsor_rotation_enabled")
    .eq("id", venueId)
    .maybeSingle<VenueScreenBrandingRow>();

  if (error || !data) {
    if (isMissingScreenSchemaError(error?.message)) {
      return { screenEnabled: true, screenSponsorRotationEnabled: false, branding: {} };
    }
    return { screenEnabled: true, screenSponsorRotationEnabled: false, branding: {} };
  }

  return {
    screenEnabled: data.screen_enabled !== false,
    screenSponsorRotationEnabled: data.screen_sponsor_rotation_enabled === true,
    branding: {
      screenBrandImageUrl: optionalTrim(data.screen_brand_image_url),
      screenBrandPrimary: normalizeBrandColor(data.screen_brand_primary),
      screenBrandSecondary: normalizeBrandColor(data.screen_brand_secondary),
    },
  };
}

export async function getActiveVenueScreenSponsors(
  venueId: string,
  nowMs: number = Date.now(),
): Promise<VenueScreenSponsorSlot[]> {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from("venue_screen_sponsors")
    .select("title, image_url, link_url, display_order, starts_at, ends_at")
    .eq("venue_id", venueId)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(12);

  if (error) {
    if (isMissingScreenSchemaError(error.message)) return [];
    return [];
  }

  return mapVenueScreenSponsorRows((data ?? []) as VenueScreenSponsorRow[], nowMs);
}

async function getLatestCategoryBlitzRound(sessionId: string): Promise<CategoryBlitzRound | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("category_blitz_rounds")
    .select("id, session_id, venue_id, letter, category_set_index, categories, started_at, ends_at, status, created_at, scored_at, mode")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<CategoryBlitzRoundRow>();

  if (error) {
    throw new Error(error.message || "Failed to load Category Blitz round.");
  }

  return data ? mapCategoryBlitzRound(data) : null;
}

async function getCategoryBlitzInput(venueId: string, now: Date): Promise<VenueScreenCategoryBlitzInput> {
  const [session, schedules] = await Promise.all([
    driveVenueCategoryBlitz(venueId, now).catch(() => null),
    listSchedules(venueId).catch(() => []),
  ]);
  const next = getNextScheduleOccurrence(schedules, now);
  // Round 1 actually fires `lobbyDwellSeconds` after the window opens (see
  // lib/categoryBlitz.ts's computeLobbyStartsAt), so the venue idle screen's
  // "starts in" preview should point at that instant, not the window open
  // time, to match the single countdown shown once a player opens the game.
  const nextStartsAt = next
    ? new Date(next.windowStart.getTime() + lobbyDwellSeconds(false) * 1000).toISOString()
    : null;

  if (!session || session.status === "complete") {
    return {
      session: null,
      round: null,
      leaderboard: null,
      nextStartsAt,
      nextRecurringDays: next?.schedule.recurringDays ?? [],
    };
  }

  const round = await getLatestCategoryBlitzRound(session.id).catch(() => null);
  const results = round && (round.status === "complete" || session.status === "scoring")
    ? await getRoundResults(round.id).catch(() => null)
    : null;

  return {
    session,
    round,
    leaderboard: results ? toLeaderboard(results.totals) : null,
    nextStartsAt,
    nextRecurringDays: next?.schedule.recurringDays ?? [],
  };
}

export function selectVenueScreenState(input: VenueScreenSelectionInput): VenueScreenState {
  const { venue, liveTrivia, categoryBlitz, updatedAt } = input;

  if (liveTrivia.isGameActive) {
    const leaderboard = liveTrivia.leaderboard ? toLeaderboard(liveTrivia.leaderboard) : null;
    const phase = liveTrivia.isFinalResultsWindow
      ? "final"
      : liveTrivia.activePhase === "mid_game_break"
      ? "intermission"
      : "question";

    return {
      ok: true,
      mode: "live-trivia",
      venue: {
        ...venue,
        name: liveTrivia.venueName ?? venue.name,
      },
      liveTrivia: {
        phase,
        roundNumber: liveTrivia.currentRound,
        totalRounds: liveTrivia.totalRounds,
        category: liveTrivia.activeQuestion?.category ?? liveTrivia.currentRoundCategory ?? null,
        question: liveTrivia.activeQuestion?.question ?? null,
        secondsRemaining: Math.max(0, Math.floor(Number(liveTrivia.secondsRemaining ?? 0))),
        leaderboard,
      },
      categoryBlitz: null,
      idle: null,
      updatedAt,
    };
  }

  if (categoryBlitz.session) {
    const round = categoryBlitz.round;
    const roundIsActive = round?.status === "active" && secondsUntil(round.endsAt, updatedAt) > 0;
    const phase = roundIsActive ? "round" : round?.status === "complete" ? "results" : "intermission";

    return {
      ok: true,
      mode: "category-blitz",
      venue,
      liveTrivia: null,
      categoryBlitz: {
        phase,
        roundId: round?.id ?? null,
        letter: round?.letter ?? null,
        categories: round?.categories ?? [],
        secondsRemaining: roundIsActive ? secondsUntil(round?.endsAt, updatedAt) : 0,
        leaderboard: categoryBlitz.leaderboard,
      },
      idle: null,
      updatedAt,
    };
  }

  return {
    ok: true,
    mode: "idle",
    venue,
    liveTrivia: null,
    categoryBlitz: null,
    idle: {
      nextLiveTrivia: liveTrivia.nextSchedule
        ? {
            startsAt: liveTrivia.nextSchedule.startTime,
            title: liveTrivia.nextSchedule.title,
            firstRoundCategory: liveTrivia.nextSchedule.firstRoundCategory ?? null,
            recurringDays: liveTrivia.nextSchedule.recurringDays,
          }
        : null,
      nextCategoryBlitz: categoryBlitz.nextStartsAt
        ? {
            startsAt: categoryBlitz.nextStartsAt,
            recurringDays: categoryBlitz.nextRecurringDays ?? [],
          }
        : null,
      sponsorSlots: input.idle?.sponsorSlots ?? [],
    },
    updatedAt,
  };
}

export async function getVenueScreenState(
  venueId: string,
  nowMs: number = Date.now()
): Promise<VenueScreenState | null> {
  const safeVenueId = String(venueId ?? "").trim();
  if (!safeVenueId) return null;

  const venue = await getVenueById(safeVenueId);
  if (!venue) return null;

  const now = new Date(nowMs);
  const [screenConfig, liveTrivia, categoryBlitz] = await Promise.all([
    getVenueScreenBranding(safeVenueId),
    getLiveShowdownState(nowMs, safeVenueId, ""),
    getCategoryBlitzInput(safeVenueId, now),
  ]);

  if (!screenConfig.screenEnabled) {
    return null;
  }

  const sponsorSlots = screenConfig.screenSponsorRotationEnabled
    ? await getActiveVenueScreenSponsors(safeVenueId, nowMs)
    : [];

  return selectVenueScreenState({
    venue: toScreenVenue(venue, screenConfig.branding),
    liveTrivia,
    categoryBlitz,
    idle: { sponsorSlots },
    updatedAt: nowMs,
  });
}

export { getVenueScreenPollIntervalMs };
