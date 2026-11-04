import { displayWindow, GAME_LABELS, splitSchedules, WEEKDAY_OPTIONS } from "@/lib/ownerScheduleDisplay";
import { promoGameOfPrize, prizesForGame, type PromoPrizeSource } from "@/lib/promo/promoPrizes";
import { PROMO_TEMPLATES, promoGameForSchedule, type PromoGameId } from "@/lib/promo/promoTemplates";
import type { OwnerSchedule } from "@/types";

// What a venue can promote right now (docs/partner-social-promo-plan.md §4.1): every upcoming scheduled
// game, plus the games partners don't schedule. Built from the lists the dashboard has ALREADY loaded
// (its games and prizes), so opening Share to social costs no extra read. Pure.

/** The "when" line: "Every Thursday" + "8 PM", or a standing line with no time. */
export type PromoWhen = { days: string; time: string | null };

export type PromoOption = {
  /** Stable picker key: "schedule:<id>" or "game:<id>". */
  key: string;
  game: PromoGameId;
  scheduleId: string | null;
  /** Picker label: "Live Trivia · Every Thursday · 8 PM". */
  label: string;
  when: PromoWhen;
};

const WEEKDAY_NAMES: Record<string, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

/** "8 PM", "8:30 PM" in the game's own time zone. */
export const promoTimeLabel = (iso: string, timeZone: string): string => {
  try {
    return new Date(iso)
      .toLocaleString("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
      .replace(":00", "")
      .replace(/\s+/g, " ");
  } catch {
    return "";
  }
};

/** "Thursday, Nov 6" for a one-off game. */
const promoDateLabel = (iso: string, timeZone: string): string => {
  try {
    return new Date(iso).toLocaleString("en-US", { timeZone, weekday: "long", month: "short", day: "numeric" });
  } catch {
    return "";
  }
};

/** Full day names for one or two days ("Every Monday & Thursday"), short ones beyond that. */
const recurringDaysLabel = (schedule: OwnerSchedule): string => {
  if (schedule.recurringType === "daily") return "Every day";
  const keys = WEEKDAY_OPTIONS.map((day) => day.key).filter((key) => schedule.recurringDays?.includes(key));
  if (keys.length === 0 || keys.length === WEEKDAY_OPTIONS.length) return keys.length ? "Every day" : "Every week";
  if (keys.length <= 2) return `Every ${keys.map((key) => WEEKDAY_NAMES[key]).join(" & ")}`;
  const short = WEEKDAY_OPTIONS.filter((day) => keys.includes(day.key)).map((day) => day.label);
  return `Every ${short.slice(0, -1).join(", ")} & ${short[short.length - 1]}`;
};

export const scheduleWhen = (schedule: OwnerSchedule): PromoWhen => {
  const window = displayWindow(schedule);
  const time = promoTimeLabel(window.startTime, schedule.timezone) || null;
  const recurring = schedule.recurringType === "daily" || schedule.recurringType === "weekly";
  const days = recurring ? recurringDaysLabel(schedule) : promoDateLabel(window.startTime, schedule.timezone);
  return { days: days || GAME_LABELS[schedule.gameType], time };
};

/** "Every Thursday · 8 PM" (picker / alt text). */
export const promoWhenText = (when: PromoWhen): string => (when.time ? `${when.days} · ${when.time}` : when.days);

export type PromoOptionsInput = {
  schedules: readonly OwnerSchedule[];
  prizes: readonly PromoPrizeSource[];
  nowMs: number;
};

/**
 * Upcoming scheduled games first (soonest first), then each game with a standing line, offered per
 * its design's `standingOffer` (everyday games always; seasonal ones only while the venue offers a
 * prize for them). A schedulable game with a standing line (Category Blitz) appears on its own only
 * when it has no upcoming schedule.
 */
export const promoOptions = ({ schedules, prizes, nowMs }: PromoOptionsInput): PromoOption[] => {
  const upcoming = splitSchedules([...schedules].filter((schedule) => schedule.isActive), nowMs).upcoming;
  const scheduled: PromoOption[] = upcoming.flatMap((schedule) => {
    const game = promoGameForSchedule(schedule.gameType);
    if (!game) return [];
    const when = scheduleWhen(schedule);
    return [{ key: `schedule:${schedule.id}`, game, scheduleId: schedule.id, label: `${GAME_LABELS[schedule.gameType]} · ${promoWhenText(when)}`, when }];
  });

  const scheduledGames = new Set(scheduled.map((option) => option.game));
  const prizeGames = new Set(prizes.filter((prize) => prize.isActive && !prize.winnerUserId).map(promoGameOfPrize));
  const standing: PromoOption[] = PROMO_TEMPLATES.flatMap((template) => {
    if (!template.standingWhen) return [];
    if (template.scheduleGameType && scheduledGames.has(template.game)) return [];
    const offer = template.standingOffer;
    const offered = offer === "always" ? true : offer === "with-prize" ? prizeGames.has(template.game) : offer();
    if (!offered) return [];
    const when: PromoWhen = { days: template.standingWhen, time: null };
    return [{ key: `game:${template.game}`, game: template.game, scheduleId: null, label: template.name, when }];
  });

  return [...scheduled, ...standing];
};

/**
 * What the end-of-flow prompt (docs/partner-social-promo-plan.md §4.5, D5) opens Share to social on: the
 * game just scheduled, or the prize just created (→ the game that prize is for, with it ticked).
 */
export type PromoFocus = { scheduleId?: string; rewardId?: string };

/**
 * The option a focus points at, or null when the list doesn't hold it (yet), so the sheet falls back to
 * its first game. A schedule picks its own option. A prize picks the first option that shows it, which
 * honours a prize pinned to one scheduled game (`prizesForGame`) and covers a game with no schedule.
 */
export const promoFocusOption = (
  options: readonly PromoOption[],
  prizes: readonly PromoPrizeSource[],
  focus: PromoFocus | null,
): PromoOption | null => {
  if (!focus) return null;
  if (focus.scheduleId) {
    const scheduled = options.find((option) => option.scheduleId === focus.scheduleId);
    if (scheduled) return scheduled;
  }
  const { rewardId } = focus;
  if (!rewardId) return null;
  return options.find((option) => prizesForGame(prizes, option.game, option.scheduleId).some((prize) => prize.id === rewardId)) ?? null;
};
