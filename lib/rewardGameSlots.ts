// Client-safe game-slot model for "winner of the game" rewards.
//
// A game-winner reward used to be described by a PERIOD ("winner of the game,
// every week"), which locked its quantity to however many games happened to fall
// in that week. Instead the partner now picks the exact scheduled games the
// reward applies to — down to the individual slot, so a venue running 6pm and
// 9pm Tuesday trivia can offer the reward at one and not the other. See
// docs/rewards-game-winner-picker-plan.md.
//
// A slot is a `{ scheduleId, weekday }` pair, NOT just a weekday: two schedules
// landing on the same weekday must stay independently selectable. The selection
// is stored on `challenge_campaigns.game_winner_slots` (jsonb), where **null
// means "award at every game"** — the legacy behavior, so every in-flight
// game-winner reward keeps working with no backfill.
//
// No "server-only" import and no Supabase dependency: the wizard (which renders
// the picker) and the server (which re-validates the selection against the
// venue's real schedule and derives cadence/quota from it) run the SAME rules.
// Mirrors the lib/rewardTerms.ts / lib/rewardDefinitions.ts split.

import type { CampaignRecurringType, ChallengeGameWinnerSlot } from "@/types";
import { REWARD_MAX_QUANTITY } from "@/lib/rewardTerms";

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/**
 * Master flag for the wizard's game picker (docs/rewards-game-winner-picker-plan.md
 * Phase 5), same reversible convention as `NEXT_PUBLIC_REWARDS_ENABLED`. Off = the
 * legacy period-based terms sentence for game-winner rewards, fully inert; on =
 * the picker below replaces it. Points-target rewards are unaffected either way.
 */
export const isGamePickerEnabled = (): boolean =>
  truthy(process.env.NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED);

export const REWARD_WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export type RewardWeekday = (typeof REWARD_WEEKDAY_KEYS)[number];

export const REWARD_WEEKDAY_LABEL: Record<RewardWeekday, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

export function isRewardWeekday(value: unknown): value is RewardWeekday {
  return (REWARD_WEEKDAY_KEYS as readonly string[]).includes(String(value ?? "").trim().toLowerCase());
}

/**
 * The stored shape — exactly what lands in `game_winner_slots` and what the
 * resolver matches an ended occurrence against. Deliberately minimal: labels and
 * recurrence are display/derivation concerns recomputed from the live schedule,
 * never persisted, so a renamed or retimed game doesn't leave a stale label
 * behind on the reward.
 */
export type StoredGameWinnerSlot = {
  scheduleId: string;
  weekday: RewardWeekday;
};

/**
 * What callers hand in: the loose shape carried on ChallengeCampaign (weekday
 * typed as string, since it came out of jsonb). Every entry point below narrows
 * it through normalizeGameWinnerSlots before trusting it.
 */
export type GameWinnerSlotInput = ChallengeGameWinnerSlot;

/**
 * One live-or-upcoming schedule, reduced to what slot enumeration needs. The
 * caller (lib/rewards.ts) resolves `recurringType` and `weekdays` with the same
 * normalization the terms sentence uses — monthly/yearly collapse to "none"
 * because nothing ever advances them forward, and a "none" schedule carrying
 * explicit recurring_days is really weekly.
 */
export type RewardGameScheduleShape = {
  scheduleId: string;
  title: string;
  recurringType: CampaignRecurringType;
  /** Weekday keys the schedule runs on; empty when its start time is unparseable. */
  weekdays: readonly string[];
  /** ISO instant of the schedule's start (its first/only occurrence). */
  startTime: string;
  /** IANA zone the schedule is authored in; times are shown to the partner in it. */
  timezone: string;
};

/**
 * The weekday key(s) a Live Trivia schedule actually runs on — the single
 * derivation, shared by the picker (lib/rewards.ts), the reward's `activeDays`,
 * and the schedule-change cascade (lib/rewardGameSlotCascade.ts). Two copies of
 * this rule would eventually disagree about which games a reward covers.
 *
 *   - daily — every weekday. Anchoring on start_time's weekday instead would
 *     restrict a daily reward to one day in seven.
 *   - monthly / yearly — the weekday of start_time, and ONLY that weekday.
 *     enumerateScheduleOccurrences (lib/liveShowdownEngine.ts) treats both as a
 *     single fixed occurrence at start_time and no cron ever advances one
 *     forward, so the game these schedules describe genuinely runs once, on that
 *     weekday — exactly like a one-off, which is what lib/rewards.ts's
 *     rewardRecurringType already collapses them to. Returning [] here instead
 *     dropped them out of the picker entirely (they were pinnable nowhere) while
 *     the creation context still reported the venue as scheduled. Their
 *     recurringDays are deliberately ignored, because the engine ignores them
 *     too.
 *   - weekly / one-off — explicit recurring days when present, else the weekday
 *     of start_time.
 */
export function scheduleRunWeekdays(schedule: {
  recurringType: string;
  recurringDays: readonly string[];
  startTime: string;
  timezone: string;
}): RewardWeekday[] {
  const recurringType = String(schedule.recurringType ?? "").trim().toLowerCase();
  if (recurringType === "daily") return [...REWARD_WEEKDAY_KEYS];
  const singleOccurrence = recurringType === "monthly" || recurringType === "yearly";

  const declared = singleOccurrence
    ? []
    : (schedule.recurringDays ?? [])
        .map((day) => String(day ?? "").trim().toLowerCase())
        .filter(isRewardWeekday);
  if (declared.length > 0) return Array.from(new Set(declared));

  const startMs = Date.parse(String(schedule.startTime ?? ""));
  if (!Number.isFinite(startMs)) return [];
  const weekday = formatInZone(schedule.startTime, schedule.timezone, { weekday: "short" })
    .trim()
    .slice(0, 3)
    .toLowerCase();
  return isRewardWeekday(weekday) ? [weekday] : [];
}

/** One selectable game on the picker. */
export type RewardGameSlot = StoredGameWinnerSlot & {
  /** Repeats every week (the picker's calendar) vs. a single dated game (its own list). */
  recurring: boolean;
  /** The schedule's own name, e.g. "Trivia Night". */
  title: string;
  /** Local time of day, e.g. "6:00 PM". */
  timeLabel: string;
  /** One-off games only: the date it runs, e.g. "Tue, Aug 4". Null for recurring. */
  dateLabel: string | null;
  /** Canonical readback, e.g. "Tuesday 6:00 PM — Trivia Night". */
  label: string;
};

export const slotKey = (slot: StoredGameWinnerSlot): string => `${slot.scheduleId}:${slot.weekday}`;

// ── Enumeration ─────────────────────────────────────────────────────────────

function formatInZone(startTime: string, timezone: string, options: Intl.DateTimeFormatOptions): string {
  const ms = Date.parse(startTime);
  if (!Number.isFinite(ms)) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone }).format(new Date(ms));
  } catch {
    // An unknown/blank IANA zone must not take the whole picker down — fall back
    // to the runtime's zone rather than dropping the slot entirely.
    return new Intl.DateTimeFormat("en-US", options).format(new Date(ms));
  }
}

/**
 * Expand a venue's schedules into the individual games a reward can be pinned to.
 *
 *  - daily            — one slot per weekday; the game genuinely runs all seven.
 *  - weekly           — one slot per weekday it runs on.
 *  - none             — a single dated game, on the weekday its start time falls on.
 *  - monthly / yearly — also a single dated game: the engine runs these exactly
 *                       once (see scheduleRunWeekdays), so they are enumerated
 *                       as one-off slots rather than as recurring ones.
 *
 * A schedule whose weekdays can't be resolved is skipped: an unpinnable slot on
 * the picker would store a selection the resolver could never match.
 */
export function enumerateGameSlots(schedules: readonly RewardGameScheduleShape[]): RewardGameSlot[] {
  const slots: RewardGameSlot[] = [];
  const seen = new Set<string>();

  for (const schedule of schedules) {
    const scheduleId = String(schedule.scheduleId ?? "").trim();
    if (!scheduleId) continue;

    // Callers normally hand in an already-collapsed recurrence
    // (lib/rewards.ts's rewardRecurringType), but monthly/yearly are re-checked
    // here so a raw row can never be labelled as repeating weekly when the
    // engine will run it once.
    const recurring =
      schedule.recurringType !== "none" &&
      schedule.recurringType !== "monthly" &&
      schedule.recurringType !== "yearly";
    const weekdays = (schedule.weekdays ?? [])
      .map((day) => String(day ?? "").trim().toLowerCase())
      .filter(isRewardWeekday);
    if (weekdays.length === 0) continue;

    const timeLabel = formatInZone(schedule.startTime, schedule.timezone, {
      hour: "numeric",
      minute: "2-digit",
    });
    const dateLabel = recurring
      ? null
      : formatInZone(schedule.startTime, schedule.timezone, {
          weekday: "short",
          month: "short",
          day: "numeric",
        }) || null;
    const title = String(schedule.title ?? "").trim();

    for (const weekday of recurring ? weekdays : weekdays.slice(0, 1)) {
      const slot: StoredGameWinnerSlot = { scheduleId, weekday };
      const key = slotKey(slot);
      if (seen.has(key)) continue;
      seen.add(key);
      const when = recurring ? REWARD_WEEKDAY_LABEL[weekday] : dateLabel ?? REWARD_WEEKDAY_LABEL[weekday];
      slots.push({
        ...slot,
        recurring,
        title,
        timeLabel,
        dateLabel,
        label: [[when, timeLabel].filter(Boolean).join(" "), title].filter(Boolean).join(" — "),
      });
    }
  }

  return slots;
}

// ── Storage ─────────────────────────────────────────────────────────────────

/**
 * Read `game_winner_slots` off a row. **null (the legacy value) is preserved as
 * null**, meaning "award at every game" — collapsing it to an empty array would
 * silently retire every reward created before this column existed.
 *
 * A malformed value is also read as null rather than as "no games": failing open
 * to the legacy behavior keeps an existing reward paying out, where failing
 * closed would silently stop a reward the partner is still advertising.
 */
export function normalizeGameWinnerSlots(value: unknown): StoredGameWinnerSlot[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;

  const slots: StoredGameWinnerSlot[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const scheduleId = String(record.scheduleId ?? record.schedule_id ?? "").trim();
    const weekday = String(record.weekday ?? "").trim().toLowerCase();
    if (!scheduleId || !isRewardWeekday(weekday)) continue;
    const slot: StoredGameWinnerSlot = { scheduleId, weekday };
    const key = slotKey(slot);
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push(slot);
  }
  // An array that parsed to nothing usable is indistinguishable from garbage;
  // fall back to the legacy "every game" rather than to "no game ever".
  return slots.length > 0 ? slots : null;
}

/** The value to write to the column: null when the reward isn't slot-pinned. */
export function serializeGameWinnerSlots(
  slots: readonly GameWinnerSlotInput[] | null | undefined,
): StoredGameWinnerSlot[] | null {
  return normalizeGameWinnerSlots(slots ?? null);
}

/**
 * The weekday of an occurrence date ("YYYY-MM-DD"), or null when it isn't one.
 *
 * findEndedOccurrences already formats occurrenceDate in the SCHEDULE's
 * timezone (lib/liveShowdownEngine.ts's formatZonedDate), so the weekday is a
 * plain calendar lookup on those digits — parsing it as UTC avoids re-applying a
 * timezone that has already been applied, which is how a 9pm game would slide
 * onto the next weekday and stop matching its own slot.
 */
export function weekdayForOccurrenceDate(occurrenceDate: string): RewardWeekday | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(occurrenceDate ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const date = new Date(ms);
  // Reject impossible dates (2026-02-31 rolls forward into March).
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return REWARD_WEEKDAY_KEYS[date.getUTCDay()] ?? null;
}

/**
 * Does a finished occurrence fall under this reward's pinned slots? A null
 * selection matches every game (legacy behavior — see the module header), which
 * is what makes this column additive and reversible.
 */
export function occurrenceMatchesSlots(
  slots: readonly GameWinnerSlotInput[] | null | undefined,
  occurrence: { scheduleId: string; weekday: string },
): boolean {
  const pinned = normalizeGameWinnerSlots(slots ?? null);
  if (pinned === null) return true;
  const scheduleId = String(occurrence.scheduleId ?? "").trim();
  const weekday = String(occurrence.weekday ?? "").trim().toLowerCase();
  if (!scheduleId || !isRewardWeekday(weekday)) return false;
  return pinned.some((slot) => slot.scheduleId === scheduleId && slot.weekday === weekday);
}

// ── Derivation ──────────────────────────────────────────────────────────────

export const GAME_SLOTS_NONE_SELECTED_MESSAGE =
  "Choose at least one Live Trivia game to offer this reward at.";
export const GAME_SLOTS_MIXED_MESSAGE =
  "A reward can cover your weekly games or a single one-off game, not both. Create a separate reward for the one-off game.";
export const GAME_SLOTS_MULTIPLE_ONE_OFF_MESSAGE =
  "You can only offer this reward at one one-off game. Pick a single game, or choose your recurring games instead.";

export function unknownGameSlotMessage(): string {
  return "One of the selected games is no longer on your schedule. Refresh and pick again.";
}

export type GameWinnerTerms = {
  /** Recurring slots run every week; a single dated game is a one-time reward. */
  cadence: CampaignRecurringType;
  /** Winners per cycle — one per selected game. */
  quota: number;
  /** Weekdays the reward is live on; the weekly cycle anchor and accrual gate. */
  weekdays: RewardWeekday[];
};

export type GameWinnerTermsResult =
  | { ok: true; terms: GameWinnerTerms }
  | { ok: false; message: string };

/**
 * Derive the campaign's cadence and quota from the selection — the partner never
 * picks them for a game-winner reward. Any recurring slot means the reward runs
 * weekly with one prize per selected game; a single one-off game means a
 * one-time reward worth exactly 1.
 *
 * Mixing the two is refused rather than reconciled. Beyond re-introducing the
 * "how many is that really, per week" ambiguity the period-based sentence had, a
 * one-time ("none") campaign is spent at its FIRST resolved game — so a mixed
 * reward would quietly award at one of its games and never the others.
 */
export function deriveGameWinnerTerms(
  selected: readonly RewardGameSlot[],
): GameWinnerTermsResult {
  if (selected.length === 0) return { ok: false, message: GAME_SLOTS_NONE_SELECTED_MESSAGE };

  const recurring = selected.filter((slot) => slot.recurring);
  const oneOff = selected.filter((slot) => !slot.recurring);
  if (recurring.length > 0 && oneOff.length > 0) {
    return { ok: false, message: GAME_SLOTS_MIXED_MESSAGE };
  }

  if (recurring.length === 0) {
    if (oneOff.length > 1) return { ok: false, message: GAME_SLOTS_MULTIPLE_ONE_OFF_MESSAGE };
    return {
      ok: true,
      terms: { cadence: "none", quota: 1, weekdays: weekdaysForSlots(oneOff) },
    };
  }

  if (recurring.length > REWARD_MAX_QUANTITY) {
    return { ok: false, message: `Choose at most ${REWARD_MAX_QUANTITY} games.` };
  }
  return {
    ok: true,
    // Weekly, and never "daily" even when all seven weekdays are selected: the
    // quota is a per-CYCLE promise, and 7 prizes across a week is the same
    // contract stated once instead of seven times.
    terms: { cadence: "weekly", quota: recurring.length, weekdays: weekdaysForSlots(recurring) },
  };
}

/** The distinct weekdays a selection runs on, in week order. */
export function weekdaysForSlots(slots: readonly StoredGameWinnerSlot[]): RewardWeekday[] {
  const present = new Set(slots.map((slot) => slot.weekday));
  return REWARD_WEEKDAY_KEYS.filter((weekday) => present.has(weekday));
}

// ── Validation ──────────────────────────────────────────────────────────────

export type ValidatedGameWinnerSlots = {
  slots: StoredGameWinnerSlot[];
  terms: GameWinnerTerms;
};

export type ValidateGameWinnerSlotsResult =
  | { ok: true; value: ValidatedGameWinnerSlots }
  | { ok: false; message: string };

/**
 * The authoritative gate: resolve a client-sent selection against the venue's
 * REAL live-or-upcoming schedule, then derive the terms from what survived.
 * Nothing about a slot — least of all whether it recurs — is taken from the
 * client, because an over-broad match spends the partner's money at games they
 * never agreed to.
 */
export function validateGameWinnerSlots(
  available: readonly RewardGameSlot[],
  selected: readonly GameWinnerSlotInput[] | null | undefined,
): ValidateGameWinnerSlotsResult {
  const requested = normalizeGameWinnerSlots(selected ?? null);
  if (requested === null) return { ok: false, message: GAME_SLOTS_NONE_SELECTED_MESSAGE };

  const availableByKey = new Map(available.map((slot) => [slotKey(slot), slot] as const));
  const resolved: RewardGameSlot[] = [];
  for (const slot of requested) {
    const match = availableByKey.get(slotKey(slot));
    if (!match) return { ok: false, message: unknownGameSlotMessage() };
    resolved.push(match);
  }

  const derived = deriveGameWinnerTerms(resolved);
  if (!derived.ok) return derived;
  return {
    ok: true,
    value: {
      slots: resolved.map((slot) => ({ scheduleId: slot.scheduleId, weekday: slot.weekday })),
      terms: derived.terms,
    },
  };
}

/** The "Offer this reward to the winner of any Live Trivia game" shorthand. */
export function selectAllRecurringSlots(available: readonly RewardGameSlot[]): RewardGameSlot[] {
  const recurring = available.filter((slot) => slot.recurring);
  // A venue with nothing recurring still gets a usable "any game" — its single
  // upcoming game. More than one one-off is not expressible as one reward (see
  // deriveGameWinnerTerms), so the earliest-listed one is what "any" means.
  return recurring.length > 0 ? recurring : available.slice(0, 1);
}

/** Shared by describeGameWinnerSlots and describeCampaignGameWinnerTerms below — the
 *  recurring-slot sentence needs nothing beyond the weekdays (in week order) and the
 *  per-cycle count, so both a live picker selection and a persisted campaign's own
 *  fields can produce it without duplicating the day-listing/pluralization logic. */
function describeRecurringWinnerTerms(weekdays: readonly RewardWeekday[], quota: number): string {
  const days = weekdays.map((weekday) => REWARD_WEEKDAY_LABEL[weekday]);
  const list = days.length === 1 ? days[0] : `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}`;
  const subject = quota === 1 ? "Winner of your" : "Winners of your";
  const verb = quota === 1 ? "gets" : "get";
  return `${subject} ${list} Live Trivia ${quota === 1 ? "game" : "games"} ${verb} this reward — ${quota} per week.`;
}

/** Readback for the confirm screen, driven by the live picker selection. */
export function describeGameWinnerSlots(slots: readonly RewardGameSlot[]): string {
  if (slots.length === 0) return "";
  const recurring = slots.filter((slot) => slot.recurring);
  if (recurring.length === 0) {
    const only = slots[0];
    return `Winner of your ${only.label} game gets this reward.`;
  }
  return describeRecurringWinnerTerms(weekdaysForSlots(recurring), recurring.length);
}

/**
 * Readback for an EXISTING slot-pinned campaign, on the owner Rewards list —
 * built entirely from what's already persisted on it (`gameWinnerSlots`,
 * `winnerQuota`, `recurringType`) rather than re-fetching the venue's live
 * schedule. The schedule-change cascade (lib/rewardGameSlotCascade.ts) already
 * keeps those fields in lockstep with reality whenever a pinned game is
 * edited or cancelled, so they're the freshest summary available without a
 * network round trip.
 *
 * Weekdays come from `gameWinnerSlots`, not `activeDays`: a one-off
 * (`recurringType: "none"`) reward is created with `activeDays: []`
 * (lib/rewards.ts), so deriving weekdays from `activeDays` renders a blank
 * terms line for every one-off slot-pinned reward. `gameWinnerSlots` carries
 * the weekday regardless of cadence. `activeDays` is kept only as a fallback
 * for legacy rows whose `gameWinnerSlots` is null (pre-picker "every game"
 * rewards, which genuinely have no slots to read).
 *
 * The one thing this can't reproduce without the live schedule is a one-off
 * game's friendly label (title/date/time) — `describeGameWinnerSlots` has
 * that for the picker's own confirm screen, which always has the live
 * selection in hand; here a one-off reward states just its weekday.
 */
export function describeCampaignGameWinnerTerms(campaign: {
  recurringType: CampaignRecurringType;
  activeDays: readonly string[];
  winnerQuota: number;
  gameWinnerSlots?: unknown;
}): string {
  const slots = normalizeGameWinnerSlots(campaign.gameWinnerSlots ?? null);
  const weekdays = slots
    ? weekdaysForSlots(slots)
    : REWARD_WEEKDAY_KEYS.filter((day) =>
        campaign.activeDays.some((d) => String(d ?? "").trim().toLowerCase() === day),
      );
  if (weekdays.length === 0) return "";
  if (campaign.recurringType === "none") {
    return `Winner of your ${REWARD_WEEKDAY_LABEL[weekdays[0]]} Live Trivia game gets this reward.`;
  }
  return describeRecurringWinnerTerms(weekdays, campaign.winnerQuota);
}
