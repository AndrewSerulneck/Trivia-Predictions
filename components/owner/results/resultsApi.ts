import { useEffect, useState } from "react";
import type { OwnerRewardDetail } from "@/lib/ownerHistoryDisplay";
import type {
  ResultsBreakdown,
  ResultsGameRow,
  ResultsGameScreen,
  ResultsTimelinePage,
} from "@/lib/results/types";

// The Results sheet's reads (docs/partner-results-page-plan.md §5e). Every failure becomes a message;
// nothing throws. The sheet calls these on a tap or an open only — never while closed, never on a timer.

export type Fetched<T> = { ok: true; value: T } | { ok: false; message: string };

const DEFAULT_ERROR = "Couldn't load results.";

/** GET a Results endpoint; `pick` returns the payload from the JSON, or undefined when it is malformed. */
export const getJson = async <T,>(url: string, pick: (json: Record<string, unknown>) => T | undefined): Promise<Fetched<T>> => {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const value = json.ok === true ? pick(json) : undefined;
    if (!res.ok || value === undefined) {
      return { ok: false, message: typeof json.error === "string" ? json.error : DEFAULT_ERROR };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, message: "Couldn't load results. Check your connection." };
  }
};

export const timelineUrl = (venueId: string, before: string | null): string =>
  `/api/owner/results?venueId=${encodeURIComponent(venueId)}${before ? `&before=${encodeURIComponent(before)}` : ""}`;

const gameBase = (game: Pick<ResultsGameRow, "competitionId" | "gameKey">): string =>
  `/api/owner/results/games/${encodeURIComponent(game.competitionId)}/${encodeURIComponent(game.gameKey)}`;

export const gameUrl = (venueId: string, game: Pick<ResultsGameRow, "competitionId" | "gameKey">): string =>
  `${gameBase(game)}?venueId=${encodeURIComponent(venueId)}`;

export const breakdownUrl = (venueId: string, game: Pick<ResultsGameRow, "competitionId" | "gameKey">, entry: string): string =>
  `${gameBase(game)}/breakdown?venueId=${encodeURIComponent(venueId)}&entry=${encodeURIComponent(entry)}`;

export const rewardUrl = (venueId: string, rewardId: string): string =>
  `/api/owner/history/rewards/${encodeURIComponent(rewardId)}?venueId=${encodeURIComponent(venueId)}`;

export const pickTimeline = (json: Record<string, unknown>): ResultsTimelinePage | undefined =>
  Array.isArray(json.games) && Array.isArray(json.rewards)
    ? {
        games: json.games as ResultsTimelinePage["games"],
        rewards: json.rewards as ResultsTimelinePage["rewards"],
        nextBefore: typeof json.nextBefore === "string" ? json.nextBefore : null,
        firstGameDate: typeof json.firstGameDate === "string" ? json.firstGameDate : null,
      }
    : undefined;

export const pickGameScreen = (json: Record<string, unknown>): ResultsGameScreen | undefined =>
  json.game && typeof json.game === "object" && Array.isArray(json.standings)
    ? {
        game: json.game as ResultsGameScreen["game"],
        standings: json.standings as ResultsGameScreen["standings"],
        rewards: Array.isArray(json.rewards) ? (json.rewards as ResultsGameScreen["rewards"]) : [],
      }
    : undefined;

export const pickBreakdown = (json: Record<string, unknown>): ResultsBreakdown | undefined =>
  Array.isArray(json.rows) && typeof json.total === "number"
    ? { rows: json.rows as ResultsBreakdown["rows"], total: json.total }
    : undefined;

export const pickReward = (json: Record<string, unknown>): OwnerRewardDetail | undefined =>
  json.reward && typeof json.reward === "object" ? (json.reward as OwnerRewardDetail) : undefined;

export type Loaded<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; value: T };

/**
 * One detail read per tap: `url` null = nothing to read (nothing selected, or the sheet is closed).
 * `nonce` changes on every tap, so tapping the same row again reads fresh data; `retry` re-reads.
 * `pick` must be a stable function (module level).
 */
export const useLoaded = <T,>(
  url: string | null,
  nonce: number,
  pick: (json: Record<string, unknown>) => T | undefined,
): [Loaded<T>, () => void] => {
  const [attempt, setAttempt] = useState(0);
  const [done, setDone] = useState<{ key: string; result: Fetched<T> } | null>(null);
  const key = url ? `${nonce}|${attempt}|${url}` : null;

  useEffect(() => {
    if (!key || !url) return;
    let cancelled = false;
    void getJson(url, pick).then((result) => {
      if (!cancelled) setDone({ key, result });
    });
    return () => {
      cancelled = true;
    };
  }, [key, url, pick]);

  const result = done && done.key === key ? done.result : null;
  const loaded: Loaded<T> = !result
    ? { status: "loading" }
    : result.ok
      ? { status: "ready", value: result.value }
      : { status: "error", message: result.message };
  return [loaded, () => setAttempt((n) => n + 1)];
};
