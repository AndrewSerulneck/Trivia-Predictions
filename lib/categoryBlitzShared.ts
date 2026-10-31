// Pure helpers shared between server-only code (lib/categoryBlitz.ts) and
// client components (CategoryBlitzGame.tsx, categoryBlitzRealtime.ts, the
// admin scheduling UI). No "server-only" import and no Supabase dependency —
// keep it that way so both sides can import from one place instead of
// hand-syncing duplicate copies.

import { fnv1aHash } from "@/lib/hash";

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/**
 * Master flag for the "continuous is the default everywhere" rollout (see
 * `docs/CATEGORY_BLITZ_CONTINUOUS_DEFAULT_PLAN.md`). Lives here (not
 * `lib/categoryBlitzPool.ts`, which is `server-only`) so both the server
 * engine and client-facing admin/owner UI can read the same flag to decide
 * whether to still offer schedule-based Category Blitz creation.
 */
export const isContinuousDefaultEnabled = (): boolean =>
  truthy(process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT);

/**
 * Master flag for pooling every venue's Category Blitz gameplay into one
 * shared hidden room (see `docs/category-blitz-global-room-plan.md`). Off =
 * today's per-venue-isolated behavior, fully inert. This flag is provisioned
 * here in Phase 0 but not yet read by any gameplay path — Phase 1 wires the
 * room-id resolver into the API routes. Never touches venue join, geofencing,
 * or venue listing, which have no notion of "room" at all.
 */
export const isGlobalRoomEnabled = (): boolean =>
  truthy(process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM);

/**
 * Deterministic, non-reversible short hash (FNV-1a, base36) used only to build
 * the realtime channel name below. Its whole job is to keep the raw id — a real
 * venue id, or worse the hidden room id `hc-cbz-live` — out of any string that
 * reaches a client. Same input always yields the same channel, so server
 * broadcasts and client subscriptions still meet.
 */
const channelHash = (input: string): string => fnv1aHash(input).toString(36);

/**
 * Canonical realtime channel name for a Category Blitz room. Lives here (not the
 * `server-only` broadcast module) so the server broadcaster, the sessions API,
 * and the client's schedule-flash subscription all derive the identical name
 * from one place. The id is hashed, never embedded verbatim, so a client that
 * inspects its channel can't read back `hc-cbz-live` (or any real venue id) and
 * infer the pooled room — the last place the shared-room fact could have leaked.
 */
export const categoryBlitzChannelName = (venueId: string): string =>
  `category-blitz-session:${channelHash(venueId)}`;

/** Seconds of active play per round. */
export const ROUND_DURATION_SECONDS = 180;

/** Seconds between one round's start and the next (play time + intermission). */
export const ROUND_INTERVAL_SECONDS = 360;

/** Seconds of intermission between rounds (derived, not a separate source of truth). */
export const INTERMISSION_SECONDS = ROUND_INTERVAL_SECONDS - ROUND_DURATION_SECONDS;

/** Seconds a freshly auto-created session dwells in the lobby before its first round starts. */
export const LOBBY_DWELL_SECONDS = 60;

/**
 * Milliseconds of tolerance past a round's `ends_at` before the server treats
 * the round as truly expired, and before any client/poll/cron path is allowed
 * to lock it into scoring. Absorbs network latency and client clock drift on
 * the auto-submit-at-zero path so an in-flight submission isn't dropped just
 * because it lands a few hundred ms after the deadline.
 */
export const SUBMISSION_GRACE_MS = 2000;

/**
 * Test mode (see lib/categoryBlitzTestMode.ts) shortens lobby dwell and the
 * gap before the next round to this many seconds, so a solo tester isn't
 * stuck waiting on production-length timers. Never applied to the
 * cron-driven engine, only to per-request/client math that a tester
 * explicitly opts into.
 */
export const TEST_MODE_SECONDS = 10;

/** Seconds of active play per round in test mode (kept generous enough to actually answer). */
export const TEST_MODE_ROUND_DURATION_SECONDS = 30;

/** Seconds of active play per round, shortened in test mode. */
export const roundDurationSeconds = (testMode: boolean): number =>
  testMode ? TEST_MODE_ROUND_DURATION_SECONDS : ROUND_DURATION_SECONDS;

/** Seconds between one round's start and the next, shortened in test mode. */
export const roundIntervalSeconds = (testMode: boolean): number =>
  testMode ? TEST_MODE_ROUND_DURATION_SECONDS + TEST_MODE_SECONDS : ROUND_INTERVAL_SECONDS;

/**
 * Seconds of intermission AFTER a round finishes scoring before the next round
 * starts. The next round is anchored on `scored_at + intermissionSeconds`, not
 * `started_at + interval`, so grading latency never eats into the review window
 * (see supabase/migrations/…_category_blitz_round_scored_at.sql). Equals the
 * nominal interval minus the round duration, so with instant grading the
 * overall cadence is unchanged from the old `started_at + interval` model.
 */
export const intermissionSeconds = (testMode: boolean): number =>
  roundIntervalSeconds(testMode) - roundDurationSeconds(testMode);

/** Seconds a freshly auto-created session dwells in the lobby, shortened in test mode. */
export const lobbyDwellSeconds = (testMode: boolean): number =>
  testMode ? TEST_MODE_SECONDS : LOBBY_DWELL_SECONDS;

/** Continuous-mode pacing for a venue (round length + intermission), in seconds. */
export type CategoryBlitzContinuousTiming = {
  roundDurationSeconds: number;
  intermissionSeconds: number;
};

/**
 * When the next round starts, in epoch ms. Mirrors the server engine's anchor
 * (lib/categoryBlitz.ts → driveContinuousCategoryBlitz): once a round is scored,
 * the next round starts a full intermission AFTER `scoredAt`, so grading latency
 * never shortens the review window; before that (or a pre-migration round with
 * no `scoredAt`) fall back to the `startedAt + interval` estimate. Continuous
 * sessions pass their per-venue timing; scheduled sessions pass none and use the
 * shared constants. Shared by the client "next round in" countdown
 * (categoryBlitzRealtime) and the venue TV screen (lib/venueScreen) so the two
 * can't drift.
 */
export const nextRoundStartAtMs = (
  round: { scoredAt: string | null; startedAt: string },
  testMode: boolean,
  continuousTiming?: CategoryBlitzContinuousTiming | null,
): number => {
  // roundIntervalSeconds(testMode) === roundDurationSeconds(testMode) +
  // intermissionSeconds(testMode) for the shared constants, so this collapse
  // is lossless against the previous 4-branch version.
  const timing = continuousTiming ?? {
    roundDurationSeconds: roundDurationSeconds(testMode),
    intermissionSeconds: intermissionSeconds(testMode),
  };

  if (round.scoredAt) {
    return new Date(round.scoredAt).getTime() + timing.intermissionSeconds * 1000;
  }
  return new Date(round.startedAt).getTime() + (timing.roundDurationSeconds + timing.intermissionSeconds) * 1000;
};

/**
 * Whether a round that starts at `startAtMs` finishes inside a schedule window
 * ending at `windowEndMs`. Shared so the client can't drift from the engine:
 * both scheduled engines (`canFitAnother` in driveVenueCategoryBlitz and the
 * cron's runCategoryBlitzEngine, lib/categoryBlitz.ts) call it with their drive
 * time, and `anotherRoundFollows` below with the next round's realistic start.
 */
export const roundFitsWindow = (startAtMs: number, windowEndMs: number, testMode: boolean): boolean =>
  startAtMs + roundDurationSeconds(testMode) * 1000 <= windowEndMs;

/**
 * How late a scheduled round realistically starts after it is due. Only the
 * open game page starts one (docs/category-blitz-how-to-play-plan.md Phase 5):
 * its round-boundary kick fires 0–3 s after the countdown hits zero
 * (`kickJitterMs`, lib/categoryBlitzRealtime.ts) and retries 1.2 + 3 + 6 s
 * later (≈ 13 s worst case), after which the 15 s fallback poll
 * (`POLL_INTERVAL_MS`) takes over. So 15 s. The engine checks the fit at that
 * later moment, so the client must too (docs/category-blitz-letter-die-plan.md
 * Phase 11.1c).
 */
export const ROUND_START_DRIVE_SLACK_MS = 15_000;

/**
 * The end a scheduled session's rounds must fit inside: the EARLIER of the live
 * open window's end and the session's own `scheduledEndAt`, frozen at creation.
 * The engine closes the session at the frozen end even when a partner extends
 * tonight's window (`isStaleAutoSession`, lib/categoryBlitz.ts), and the live end
 * catches a window shortened mid-game. An unparsable or missing frozen end → the
 * live end only. The one home of this rule: both engines' fit checks and
 * `anotherRoundFollows` (docs/category-blitz-letter-die-plan.md Phase 13.4).
 */
export const sessionWindowEndMs = (liveEndMs: number, scheduledEndAt: string | null): number => {
  const frozenEndMs = scheduledEndAt ? Date.parse(scheduledEndAt) : Number.NaN;
  return Number.isNaN(frozenEndMs) ? liveEndMs : Math.min(liveEndMs, frozenEndMs);
};

/**
 * Whether another round will follow `latestRound` in this session — the client's
 * read of the engine's decision, so the letter die (CategoryBlitzGame) never
 * tumbles over a session's final standings (docs/category-blitz-letter-die-plan.md
 * Phases 7.2, 11.1b/c, 12.1a). Continuous sessions loop until stopped (a stop
 * arrives as `complete`). A scheduled session ends at the EARLIER of two times:
 * the LIVE open window's end that the sessions API derives from tonight's
 * schedules (`scheduleWindowEndAt`, which catches a partner shortening the
 * window mid-game), and the session's own `scheduledEndAt`, frozen at creation,
 * because the engine still closes the session then even if the window was
 * extended (`isStaleAutoSession`, lib/categoryBlitz.ts). Null live window (no
 * open window, or a manual session the engine never advances) or missing (an
 * older server) → false: skipping a tumble beats covering the final standings.
 * The fit is checked at the round's due time plus ROUND_START_DRIVE_SLACK_MS,
 * because that is when the engine actually checks it.
 */
export const anotherRoundFollows = (
  session: { sessionType: "scheduled" | "continuous"; testMode: boolean; scheduledEndAt: string | null },
  latestRound: { scoredAt: string | null; startedAt: string },
  scheduleWindowEndAt: string | null | undefined,
): boolean => {
  if (session.sessionType === "continuous") return true;
  if (!scheduleWindowEndAt) return false;
  const liveEndMs = Date.parse(scheduleWindowEndAt);
  if (Number.isNaN(liveEndMs)) return false;
  const windowEndMs = sessionWindowEndMs(liveEndMs, session.scheduledEndAt);
  const startAtMs = nextRoundStartAtMs(latestRound, session.testMode) + ROUND_START_DRIVE_SLACK_MS;
  return roundFitsWindow(startAtMs, windowEndMs, session.testMode);
};

/**
 * How long past a continuous round's next-round instant the game still counts
 * as awake. Only the open game page starts rounds (docs/category-blitz-how-to-play-plan.md
 * Phase 5, "sleep when idle"): its boundary kick lands within ~0–10s and its
 * fallback poll within 15s, so 30s covers a slow wake without making a
 * genuinely idle venue look live for long.
 */
export const CATEGORY_BLITZ_SLEEP_GRACE_MS = 30_000;

/**
 * True while a continuous venue's game is running: a round is in play, or its
 * results/intermission are still showing. False once the next round was due
 * (plus the grace) and nobody with the game open started it — the game is
 * asleep. A session with no rounds is asleep too. Read-only callers (venue
 * home's LIVE badge, the TV, the admin panel) use this instead of "a session
 * exists", because continuous sessions stay open forever.
 */
export const isContinuousGameAwake = (
  latestRound: { scoredAt: string | null; startedAt: string } | null,
  testMode: boolean,
  continuousTiming: CategoryBlitzContinuousTiming,
  nowMs: number,
): boolean => {
  if (!latestRound) return false;
  return nowMs < nextRoundStartAtMs(latestRound, testMode, continuousTiming) + CATEGORY_BLITZ_SLEEP_GRACE_MS;
};

/**
 * True when `answer` starts with `letter`, ignoring a leading "the"/"a"/"an"
 * and case. A bare article with nothing after it ("a", "the") is rejected
 * rather than treated as starting with the article's own letter.
 */
export const answerStartsWithLetter = (answer: string, letter: string): boolean => {
  const trimmed = answer.trim().toLowerCase();
  if (!trimmed || /^(the|a|an)$/.test(trimmed)) return false; // bare article isn't an answer
  const stripped = trimmed.replace(/^(the|a|an)\s+/, "");
  if (!stripped) return false;
  return stripped.charAt(0).toUpperCase() === letter.toUpperCase();
};

/** Total game length for N rounds: each round plus an intermission after it, except the last. */
export const gameDurationMinutes = (rounds: number): number => {
  const safeRounds = Math.max(1, Math.floor(rounds) || 1);
  const roundMinutes = ROUND_DURATION_SECONDS / 60;
  const intermissionMinutes = INTERMISSION_SECONDS / 60;
  return safeRounds * roundMinutes + Math.max(0, safeRounds - 1) * intermissionMinutes;
};

/** Best-effort inverse of gameDurationMinutes, for prefilling the edit form from a stored window. */
export const roundsFromWindowMinutes = (windowMinutes: number): number => {
  const roundMinutes = ROUND_DURATION_SECONDS / 60;
  const intermissionMinutes = INTERMISSION_SECONDS / 60;
  const cycleMinutes = roundMinutes + intermissionMinutes;
  const estimate = (windowMinutes + intermissionMinutes) / cycleMinutes;
  return Math.max(1, Math.round(estimate));
};
