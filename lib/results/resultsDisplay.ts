// The Results page's pure display rules (docs/partner-results-page-plan.md §4): the loaded timeline
// grouped Year → Month → Week → Day, with each reward on the card, day or week the server placed it
// on, plus the wording of winners and scores.
//
// Pure and client-safe. components/owner/results/ renders what this returns and never names a
// competition: labels and units come from lib/results/competitions.ts.
//
// Weeks run Monday–Sunday and are cut at month edges (as the old Games list), so a week sits inside
// one month. A week reward row is the LAST thing in the week group it is dated in. Nothing is dropped:
// a reward that names a game the page doesn't hold becomes a row on its own day.
//
// PAGING. A page covers the dates from its `nextBefore` upwards completely, so a group that starts
// before `completeFrom` (= the last page's `nextBefore`) may still be missing older results and its
// count is open-ended ("4+ games") until "Show more" fills it in.

import { placeOrdinal } from "@/lib/rankedPlaceRewards";
import {
  dayMs,
  DAY,
  formatOccurrenceDate,
  isoOf,
  lastDayOfMonth,
  mondayOf,
  MONTH_NAMES,
  weekRangeLabel,
} from "@/lib/ownerHistoryDisplay";
import type { ResultsGameRow, ResultsRewardItem, ResultsRewardWinner } from "@/lib/results/types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** What one day shows: a game (with the rewards won at it), or a reward of its own. */
export type ResultsDayEntry =
  | { kind: "game"; game: ResultsGameRow; rewards: ResultsRewardItem[] }
  | { kind: "reward"; reward: ResultsRewardItem };

export type ResultsDayGroup = { date: string; label: string; entries: ResultsDayEntry[] };

type GroupBase = { key: string; label: string; gameCount: number; rewardCount: number; complete: boolean };
export type ResultsWeekGroup = GroupBase & {
  days: ResultsDayGroup[];
  /** Week-level rewards, shown after the days. */
  weekRewards: ResultsRewardItem[];
};
export type ResultsMonthGroup = GroupBase & { weeks: ResultsWeekGroup[] };
export type ResultsYearGroup = GroupBase & { months: ResultsMonthGroup[] };

/** Stable React key for one reward cycle. */
export const rewardItemKey = (reward: Pick<ResultsRewardItem, "rewardId" | "cycleStart">): string =>
  `${reward.rewardId}:${reward.cycleStart}`;

const gameKeyOf = (competitionId: string, gameKey: string): string => `${competitionId}\u0000${gameKey}`;

type DateSlot = {
  date: string;
  games: ResultsGameRow[];
  cardRewards: Map<string, ResultsRewardItem[]>;
  dayRewards: ResultsRewardItem[];
  weekRewards: ResultsRewardItem[];
};

/**
 * The loaded games and rewards as Year → Month → Week → Day, newest first at every level.
 * `byYear` only changes the month labels ("October" under a year heading, else "October 2026"); the
 * year level is always built and the sheet skips it when `byYear` is off. `completeFrom` = the last
 * page's `nextBefore` (null = nothing older exists).
 */
export const groupResultsTimeline = (
  input: { games: ReadonlyArray<ResultsGameRow>; rewards: ReadonlyArray<ResultsRewardItem> },
  options: { byYear: boolean; completeFrom: string | null },
): ResultsYearGroup[] => {
  const games = input.games.filter((game) => DATE_PATTERN.test(game.date));

  const slots = new Map<string, DateSlot>();
  const slotFor = (date: string): DateSlot => {
    let slot = slots.get(date);
    if (!slot) {
      slot = { date, games: [], cardRewards: new Map(), dayRewards: [], weekRewards: [] };
      slots.set(date, slot);
    }
    return slot;
  };

  for (const game of games) slotFor(game.date).games.push(game);
  for (const reward of input.rewards) {
    if (!DATE_PATTERN.test(reward.date)) continue;
    const { attach } = reward;
    const card =
      attach.kind === "game"
        ? games.find((game) => game.competitionId === attach.competitionId && game.gameKey === attach.gameKey)
        : undefined;
    if (attach.kind === "game" && card) {
      // On its game's card; the card's date decides where that is.
      const target = slotFor(card.date);
      const key = gameKeyOf(card.competitionId, card.gameKey);
      target.cardRewards.set(key, [...(target.cardRewards.get(key) ?? []), reward]);
    } else if (attach.kind === "week") {
      slotFor(reward.date).weekRewards.push(reward);
    } else {
      // A day row, or a game reward whose game this page doesn't hold: never dropped.
      slotFor(reward.date).dayRewards.push(reward);
    }
  }

  const completeFrom = options.completeFrom;
  const complete = (groupStart: string): boolean => completeFrom === null || groupStart >= completeFrom;

  const years: ResultsYearGroup[] = [];
  const dates = [...slots.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  for (const date of dates) {
    const slot = slots.get(date) as DateSlot;
    const [year, month] = date.split("-").map(Number);
    const yearKey = `y${year}`;
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthKey = `m${monthStart.slice(0, 7)}`;
    const weekStart = mondayOf(date) < monthStart ? monthStart : mondayOf(date);
    const sunday = isoOf(dayMs(mondayOf(date)) + 6 * DAY);
    const monthEnd = lastDayOfMonth(year, month);
    const weekEnd = sunday > monthEnd ? monthEnd : sunday;
    const weekKey = `w${weekStart}`;

    let yearGroup = years[years.length - 1];
    if (yearGroup?.key !== yearKey) {
      yearGroup = { key: yearKey, label: String(year), gameCount: 0, rewardCount: 0, complete: complete(`${year}-01-01`), months: [] };
      years.push(yearGroup);
    }
    let monthGroup = yearGroup.months[yearGroup.months.length - 1];
    if (monthGroup?.key !== monthKey) {
      const name = MONTH_NAMES[month - 1];
      monthGroup = {
        key: monthKey,
        label: options.byYear ? name : `${name} ${year}`,
        gameCount: 0,
        rewardCount: 0,
        complete: complete(monthStart),
        weeks: [],
      };
      yearGroup.months.push(monthGroup);
    }
    let weekGroup = monthGroup.weeks[monthGroup.weeks.length - 1];
    if (weekGroup?.key !== weekKey) {
      weekGroup = {
        key: weekKey,
        label: weekRangeLabel(weekStart, weekEnd),
        gameCount: 0,
        rewardCount: 0,
        complete: complete(weekStart),
        days: [],
        weekRewards: [],
      };
      monthGroup.weeks.push(weekGroup);
    }

    const entries: ResultsDayEntry[] = [
      ...slot.games.map((game): ResultsDayEntry => ({
        kind: "game",
        game,
        rewards: slot.cardRewards.get(gameKeyOf(game.competitionId, game.gameKey)) ?? [],
      })),
      ...slot.dayRewards.map((reward): ResultsDayEntry => ({ kind: "reward", reward })),
    ];
    if (entries.length > 0) weekGroup.days.push({ date, label: formatOccurrenceDate(date, year), entries });
    weekGroup.weekRewards.push(...slot.weekRewards);

    const cardRewardCount = [...slot.cardRewards.values()].reduce((sum, list) => sum + list.length, 0);
    const rewardCount = cardRewardCount + slot.dayRewards.length + slot.weekRewards.length;
    for (const group of [yearGroup, monthGroup, weekGroup]) {
      group.gameCount += slot.games.length;
      group.rewardCount += rewardCount;
    }
  }
  return years;
};

/** The groups open when the list first shows: the newest year, its newest month and that month's newest week. */
export const defaultOpenResultsKeys = (years: ReadonlyArray<ResultsYearGroup>): Set<string> => {
  const year = years[0];
  const month = year?.months[0];
  const week = month?.weeks[0];
  return new Set([year?.key, month?.key, week?.key].filter((key): key is string => Boolean(key)));
};

/** "3 games", "13+ games" while older ones aren't loaded; a group with only rewards says "1 reward". */
export const groupCountLabel = (group: Pick<GroupBase, "gameCount" | "rewardCount" | "complete">): string => {
  const plus = group.complete ? "" : "+";
  if (group.gameCount > 0) return `${group.gameCount}${plus} game${group.gameCount === 1 && group.complete ? "" : "s"}`;
  return `${group.rewardCount}${plus} reward${group.rewardCount === 1 && group.complete ? "" : "s"}`;
};

/** "1,240 pts": a score with the competition's unit. */
/**
 * A prize's title on a game: its name — or, when the same prize appears more than once among `items`
 * (a prize paid at several moments of one game), its cycle label first so it stays visible on a phone:
 * "Halftime · Super Bowl Squares Challenge". `compact` (a line on the game's own card, where the game is
 * already the heading and the winner shares the line) drops the name: "Halftime". Generic: it never
 * asks which competition it is.
 */
export const rewardTitleAt = (
  reward: Pick<ResultsRewardItem, "rewardId" | "name" | "cycleLabel">,
  items: ReadonlyArray<Pick<ResultsRewardItem, "rewardId">>,
  options: { compact?: boolean } = {},
): string => {
  if (items.filter((item) => item.rewardId === reward.rewardId).length <= 1) return reward.name;
  return options.compact ? reward.cycleLabel : `${reward.cycleLabel} · ${reward.name}`;
};

export const scoreLabel = (score: number, unit: string): string => `${score.toLocaleString("en-US")} ${unit}`.trim();

/** "bobby_t", "Deleted player"; a place first for a places reward: "1st bobby_t". */
export const rewardWinnerInline = (winner: Pick<ResultsRewardWinner, "place" | "username">): string => {
  const name = winner.username ?? "Deleted player";
  return winner.place ? `${placeOrdinal(winner.place)} ${name}` : name;
};

/** "1st bobby_t · 2nd kate99", or the reason nobody won, or "No winner". */
export const rewardWinnersLine = (reward: Pick<ResultsRewardItem, "winners" | "note">, max = 3): string => {
  if (reward.winners.length === 0) return reward.note ?? "No winner";
  const shown = reward.winners.slice(0, max).map(rewardWinnerInline);
  const more = reward.winners.length - shown.length;
  return `${shown.join(" · ")}${more > 0 ? ` & ${more} more` : ""}`;
};

/** The standings search: case-insensitive "contains" on the name the partner reads. */
export const matchesPlayerSearch = (username: string | null, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return (username ?? "Deleted player").toLowerCase().includes(needle);
};
