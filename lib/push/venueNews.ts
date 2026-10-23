import "server-only";
import { after } from "next/server";
import { disablePushDevices } from "@/lib/push/devices";
import { isPushSendingConfigured, sendPushMessages, type PushMessage } from "@/lib/push/fcm";
import { describeRewardPrizeInSentence, type RewardPrizeSummaryInput } from "@/lib/rewardDefinitions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getVenueDisplayName } from "@/lib/venueDisplayName";
import type { OwnerSchedule, OwnerScheduleGameType } from "@/types";

// "News from your bars" (docs/native-app-store-plan.md Phase 5.4, Andrew 2026-10-23): when a partner saves
// a NEW game or prize, one push to the players of that bar whose phone has the "news" switch on. Called
// only from the two partner create routes (POST /api/owner/schedule, POST /api/owner/rewards), after the
// save succeeded, through `announceAfterResponse` — the partner's reply never waits on Google.
//
// The claim_venue_news_push RPC is the one gate: under a per-bar lock it refuses a repeat (each game or
// prize is announced once, ever), refuses past VENUE_NEWS_DAILY_CAP on the bar's local date, reads the
// audience once and records the claim before anything is sent. Never retried (no retry storms): a failed
// push is dropped. Never throws — a push problem must not look like a failed save.
//
// Cost: push off → nothing. On → per partner save: one RPC, one venue-name read (10-min cache), one HTTP
// call per phone (FCM has no batch endpoint; sendPushMessages runs 8 at a time). No cron.

/** Automatic game/prize pushes per bar per local day (Andrew, 2026-10-23). 5.5's partner messages have their own cap. */
export const VENUE_NEWS_DAILY_CAP = 5;
/** A phone not seen for this long is left out (same idea as the Live Trivia reminder). */
export const VENUE_NEWS_MAX_IDLE_DAYS = 60;

export type VenueNewsKind = "game" | "prize";

export type VenueNewsOutcome = "claimed" | "duplicate" | "capped" | "unknown_venue" | "no_audience";

export type VenueNewsReport = {
  kind: VenueNewsKind;
  skipped?: "not-configured" | "unavailable" | "past" | "failed";
  outcome?: VenueNewsOutcome;
  sent: number;
  failed: number;
  disabledDevices: number;
};

type ClaimRow = { outcome: VenueNewsOutcome; device_id: string | null; token: string | null };

const GAME_NAME: Record<OwnerScheduleGameType, string> = {
  live_trivia: "Live Trivia",
  category_blitz: "Category Blitz",
};

const DAY_NAME: Record<string, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};
const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const formatIn = (ms: number, timezone: string, options: Intl.DateTimeFormatOptions): string => {
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone }).format(ms);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "America/New_York" }).format(ms);
  }
};

const joinWords = (words: string[]): string =>
  words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

const titleAt = (what: string, venueName: string | null): string =>
  venueName ? `${what} at ${venueName}` : `${what} at your bar`;

/** Pure: the push for a new game — "Live Trivia every Thursday at 8:00 PM. Tap to see it." */
export const newGamePush = (
  schedule: Pick<OwnerSchedule, "gameType" | "startTime" | "timezone" | "recurringType" | "recurringDays">,
  venueName: string | null,
): { title: string; body: string } => {
  const startMs = Date.parse(schedule.startTime);
  const time = formatIn(startMs, schedule.timezone, { hour: "numeric", minute: "2-digit" });
  const days = DAY_ORDER.filter((day) => (schedule.recurringDays ?? []).includes(day)).map((day) => DAY_NAME[day]);
  const when =
    schedule.recurringType === "daily"
      ? `every day at ${time}`
      : schedule.recurringType === "weekly" && days.length > 0
        ? `every ${joinWords(days)} at ${time}`
        : `${formatIn(startMs, schedule.timezone, { weekday: "short", month: "short", day: "numeric" })} at ${time}`;
  return {
    title: titleAt("New game", venueName),
    body: `${GAME_NAME[schedule.gameType] ?? "A new game"} ${when}. Tap to see it.`,
  };
};

/** Pure: the push for a new prize — "Win a $25 gift card. Tap to see how." */
export const newPrizePush = (
  prize: RewardPrizeSummaryInput & { placePrizes?: RewardPrizeSummaryInput[] | null },
  venueName: string | null,
): { title: string; body: string } => {
  const places = prize.placePrizes ?? [];
  const body =
    places.length > 1
      ? `Prizes for the top ${places.length}. Tap to see how to win.`
      : `Win ${describeRewardPrizeInSentence(places[0] ?? prize)}. Tap to see how.`;
  return { title: titleAt("New prize", venueName), body };
};

const announce = async (input: {
  venueId: string;
  kind: VenueNewsKind;
  sourceId: string;
  compose: (venueName: string | null) => { title: string; body: string };
}): Promise<VenueNewsReport> => {
  const report: VenueNewsReport = { kind: input.kind, sent: 0, failed: 0, disabledDevices: 0 };
  if (!isPushSendingConfigured()) return { ...report, skipped: "not-configured" };
  const admin = supabaseAdmin;
  if (!admin) return { ...report, skipped: "unavailable" };

  try {
    const { data, error } = await admin.rpc("claim_venue_news_push", {
      p_venue_id: input.venueId,
      p_kind: input.kind,
      p_source_id: input.sourceId,
      p_daily_cap: VENUE_NEWS_DAILY_CAP,
      p_max_idle_days: VENUE_NEWS_MAX_IDLE_DAYS,
    });
    if (error) throw new Error(error.message || "claim failed");
    const rows = (data ?? []) as ClaimRow[];
    report.outcome = rows[0]?.outcome ?? "no_audience";
    const phones = rows.filter(
      (row): row is ClaimRow & { device_id: string; token: string } =>
        row.outcome === "claimed" && Boolean(row.device_id) && Boolean(row.token),
    );
    if (phones.length === 0) {
      console.info("[Push] venue-news", report);
      return report;
    }

    const { title, body } = input.compose(await getVenueDisplayName(input.venueId));
    const path = `/venue/${encodeURIComponent(input.venueId)}`;
    const messages: PushMessage[] = phones.map((phone) => ({ token: phone.token, title, body, path }));
    const results = await sendPushMessages(messages);
    const deadDeviceIds: string[] = [];
    results.forEach((result, index) => {
      if (result.ok) {
        report.sent += 1;
        return;
      }
      report.failed += 1;
      if (result.dead) deadDeviceIds.push(phones[index].device_id);
    });
    await disablePushDevices(deadDeviceIds, "fcm-dead-token");
    report.disabledDevices = new Set(deadDeviceIds).size;
  } catch (error) {
    console.error("[Push] venue-news-failed", { kind: input.kind, message: error instanceof Error ? error.message : "unknown" });
    return { ...report, skipped: "failed" };
  }

  console.info("[Push] venue-news", report);
  return report;
};

/** A partner saved a new game. A one-off game that has already ended is not news. */
export const announceNewGame = async (schedule: OwnerSchedule, nowMs: number = Date.now()): Promise<VenueNewsReport> => {
  if (schedule.recurringType === "none" && Date.parse(schedule.endTime) <= nowMs) {
    return { kind: "game", skipped: "past", sent: 0, failed: 0, disabledDevices: 0 };
  }
  return announce({
    venueId: schedule.venueId,
    kind: "game",
    sourceId: schedule.id,
    compose: (venueName) => newGamePush(schedule, venueName),
  });
};

/** A partner saved a new prize at one of their bars. */
export const announceNewPrize = async (
  venueId: string,
  campaign: RewardPrizeSummaryInput & { id: string; placePrizes?: RewardPrizeSummaryInput[] | null },
): Promise<VenueNewsReport> =>
  announce({
    venueId,
    kind: "prize",
    sourceId: campaign.id,
    compose: (venueName) => newPrizePush(campaign, venueName),
  });

/**
 * Runs an announcement after the partner's reply has been sent (Next's `after`, kept alive on Vercel
 * until it finishes). Outside a request (scripts, tests) it simply runs in the background.
 */
export const announceAfterResponse = (task: () => Promise<unknown>): void => {
  const run = () => task().catch(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
};
