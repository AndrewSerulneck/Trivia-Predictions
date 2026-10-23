import "server-only";
import { disablePushDevices } from "@/lib/push/devices";
import { isPushSendingConfigured, sendPushMessages, type PushMessage } from "@/lib/push/fcm";
import { pushCategoryForNotification, safePushPath } from "@/lib/pushCategories";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// The notification push outbox (docs/native-app-store-plan.md Phase 5.1). Every in-app notification is
// also sent to the player's phones, whoever wrote it: eight TypeScript files and two SQL functions
// (Bingo grading, prediction settlement) insert into `notifications`, so this reads the table rather than
// hooking any one writer. Runs once a minute at the end of /api/cron/bingo-progress (after the Bingo
// refresh, so a Bingo win from that run goes out in the same minute). No new cron.
//
// Cost: push not configured (lib/push/fcm.ts) → returns before any read. Set → one RPC per minute, which stamps
// each new notification once (claim_notification_pushes, SKIP LOCKED) and returns its phones; then one
// HTTP call per phone. Never retried; dead tokens are disabled in the same run.

/** How far back a run looks. A notification older than this (an outage) is never pushed late. */
export const OUTBOX_WINDOW_SECONDS = 900;
/** At most this many notifications per run; the rest go out in the next minute. */
export const OUTBOX_BATCH_LIMIT = 500;

type ClaimedRow = {
  notification_id: string;
  message: string;
  link_url: string | null;
  device_id: string;
  token: string;
  notify_prizes: boolean;
  notify_results: boolean;
};

export type OutboxReport = {
  skipped?: "not-configured" | "unavailable";
  claimedRows: number;
  sent: number;
  failed: number;
  muted: number;
  disabledDevices: number;
};

/** Pure: which claimed rows become pushes, after each phone's switches. Exported for tests. */
export const pushesFromClaimedRows = (
  rows: readonly ClaimedRow[],
): { messages: Array<PushMessage & { deviceId: string }>; muted: number } => {
  const messages: Array<PushMessage & { deviceId: string }> = [];
  let muted = 0;
  for (const row of rows) {
    const category = pushCategoryForNotification(row.link_url);
    const allowed = category === "prizes" ? row.notify_prizes : row.notify_results;
    const body = String(row.message ?? "").trim();
    if (!allowed || !body) {
      muted += 1;
      continue;
    }
    messages.push({ deviceId: row.device_id, token: row.token, body, path: safePushPath(row.link_url) });
  }
  return { messages, muted };
};

export const sendPendingNotificationPushes = async (): Promise<OutboxReport> => {
  const report: OutboxReport = { claimedRows: 0, sent: 0, failed: 0, muted: 0, disabledDevices: 0 };
  if (!isPushSendingConfigured()) return { ...report, skipped: "not-configured" };
  if (!supabaseAdmin) return { ...report, skipped: "unavailable" };

  const { data, error } = await supabaseAdmin.rpc("claim_notification_pushes", {
    p_window_seconds: OUTBOX_WINDOW_SECONDS,
    p_limit: OUTBOX_BATCH_LIMIT,
  });
  if (error) throw new Error(error.message || "claim_notification_pushes failed.");

  const rows = (data ?? []) as ClaimedRow[];
  report.claimedRows = rows.length;
  if (rows.length === 0) return report;

  const { messages, muted } = pushesFromClaimedRows(rows);
  report.muted = muted;
  const results = await sendPushMessages(messages);
  const deadDeviceIds: string[] = [];
  results.forEach((result, index) => {
    if (result.ok) {
      report.sent += 1;
      return;
    }
    report.failed += 1;
    if (result.dead) deadDeviceIds.push(messages[index].deviceId);
  });
  await disablePushDevices(deadDeviceIds, "fcm-dead-token");
  report.disabledDevices = new Set(deadDeviceIds).size;

  console.info("[Push] outbox", report);
  return report;
};
