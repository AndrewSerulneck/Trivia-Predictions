import "server-only";
import { disablePushDevices } from "@/lib/push/devices";
import { isPushSendingConfigured, sendPushMessages, type PushMessage } from "@/lib/push/fcm";
import { announceAfterResponse, VENUE_NEWS_MAX_IDLE_DAYS } from "@/lib/push/venueNews";
import {
  checkPartnerMessage,
  PARTNER_MESSAGE_PARAM,
  PARTNER_MESSAGE_REPORTS_TO_PAUSE,
  PARTNER_MESSAGES_DAILY_CAP,
  type PartnerMessageProblem,
} from "@/lib/partnerMessageRules";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isMissingFunction } from "@/lib/supabaseRpcErrors";
import { getVenueDisplayName } from "@/lib/venueDisplayName";

// Partner-written messages (docs/native-app-store-plan.md Phase 5.5, Andrew 2026-10-23): a partner's short
// note from the Partner Dashboard, pushed to the players of that bar whose phone has "News from your bars"
// on — the 5.4 audience. The ONLY caller of the claim_venue_message_push, read_venue_message,
// report_venue_message, venue_message_report_counts and unpause_venue_messages RPCs and the only writer of
// push_venue_message_pauses.
//
// Gates, in order: the words/links filter (lib/partnerMessageRules.ts, also run in the compose box), then
// the RPC under a per-bar lock: a paused bar is refused, PARTNER_MESSAGES_DAILY_CAP per local day, the
// audience is read once and the message recorded before anything is sent. A message with no phone to go
// to is not recorded and does not count. The pushes go after the partner's reply (announceAfterResponse)
// and are never retried; dead tokens are disabled.
//
// Abuse: a player who opens a message can report it; PARTNER_MESSAGE_REPORTS_TO_PAUSE reports from different
// PEOPLE (an account, or a profile with none; Phase 10.1, migration 20261026173304) pause the bar — the RPC
// does it in the same lock. An admin can pause or un-pause any bar (Venues → Partner messages); an un-pause
// marks the bar's reports reviewed, so only reports made after it count towards the next pause. The whole feature is behind NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED.
//
// Cost: ≤ 2 sends per bar per day: one RPC + one venue-name read (10-min cache) + one FCM call per phone.
// The compose box's status is 3 small reads per open. A player's open/report is one RPC each. No cron.

export type VenueMessageSummary = { id: string; body: string; sentAt: string; devices: number };

export type VenueMessageStatus = {
  cap: number;
  remaining: number;
  paused: boolean;
  /** Newest first, at most RECENT_LIMIT. */
  recent: VenueMessageSummary[];
};

const RECENT_LIMIT = 10;
const ADMIN_LIMIT = 50;
const DEFAULT_TIMEZONE = "America/New_York";

export class VenueMessagesUnavailableError extends Error {}

const MIGRATION_MISSING_MESSAGE = "Partner messages need the latest database update (migration 20261026173304).";

const requireAdmin = () => {
  if (!supabaseAdmin) throw new VenueMessagesUnavailableError("Messages are unavailable right now.");
  return supabaseAdmin;
};

/** The bar's local date (YYYY-MM-DD), the same day the RPC counts. Bad timezone → New York. */
export const localDateIn = (timezone: string | null | undefined, nowMs: number = Date.now()): string => {
  const format = (timeZone: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(nowMs);
  try {
    return format(timezone || DEFAULT_TIMEZONE);
  } catch {
    return format(DEFAULT_TIMEZONE);
  }
};

/** The compose box: how many are left today, whether the bar is paused, what was sent lately. */
export const getVenueMessageStatus = async (venueId: string, nowMs: number = Date.now()): Promise<VenueMessageStatus> => {
  const admin = requireAdmin();
  const [venue, messages, pause] = await Promise.all([
    admin.from("venues").select("timezone").eq("id", venueId).maybeSingle(),
    admin
      .from("push_venue_messages")
      .select("id, body, sent_at, devices, local_date")
      .eq("venue_id", venueId)
      .order("sent_at", { ascending: false })
      .limit(RECENT_LIMIT),
    admin.from("push_venue_message_pauses").select("venue_id").eq("venue_id", venueId).maybeSingle(),
  ]);
  const error = venue.error ?? messages.error ?? pause.error;
  if (error) throw new VenueMessagesUnavailableError(error.message || "Couldn't load messages.");

  const today = localDateIn((venue.data as { timezone?: string | null } | null)?.timezone, nowMs);
  const rows = (messages.data ?? []) as Array<{ id: string; body: string; sent_at: string; devices: number; local_date: string }>;
  const sentToday = rows.filter((row) => row.local_date === today).length;
  return {
    cap: PARTNER_MESSAGES_DAILY_CAP,
    remaining: Math.max(0, PARTNER_MESSAGES_DAILY_CAP - sentToday),
    paused: Boolean(pause.data),
    recent: rows.map((row) => ({ id: row.id, body: row.body, sentAt: row.sent_at, devices: row.devices })),
  };
};

export type SendVenueMessageResult =
  | { ok: true; messageId: string; devices: number }
  | { ok: false; reason: PartnerMessageProblem | "paused" | "capped" | "no_audience" | "unknown_venue" | "not_configured" };

type ClaimRow = { outcome: string; message_id: string | null; device_id: string | null; token: string | null };

/** Path a tapped message opens: the bar's Venue Home, which shows the message with Report. */
export const venueMessagePath = (venueId: string, messageId: string): string =>
  `/venue/${encodeURIComponent(venueId)}?${PARTNER_MESSAGE_PARAM}=${encodeURIComponent(messageId)}`;

const pushToPhones = async (
  venueId: string,
  messageId: string,
  text: string,
  phones: Array<{ device_id: string; token: string }>,
): Promise<void> => {
  const report = { messageId, sent: 0, failed: 0, disabledDevices: 0 };
  try {
    const title = (await getVenueDisplayName(venueId)) ?? undefined;
    const path = venueMessagePath(venueId, messageId);
    const messages: PushMessage[] = phones.map((phone) => ({ token: phone.token, title, body: text, path }));
    const results = await sendPushMessages(messages);
    const dead: string[] = [];
    results.forEach((result, index) => {
      if (result.ok) {
        report.sent += 1;
        return;
      }
      report.failed += 1;
      if (result.dead) dead.push(phones[index].device_id);
    });
    await disablePushDevices(dead, "fcm-dead-token");
    report.disabledDevices = new Set(dead).size;
    console.info("[Push] venue-message", report);
  } catch (error) {
    console.error("[Push] venue-message-failed", { messageId, message: error instanceof Error ? error.message : "unknown" });
  }
};

/**
 * Send a partner's message. The caller has already checked the partner owns `venueId`. Returns once the
 * message is recorded; the pushes go after the reply.
 */
export const sendVenueMessage = async (input: {
  venueId: string;
  ownerId: string;
  text: string;
}): Promise<SendVenueMessageResult> => {
  const checked = checkPartnerMessage(input.text);
  if (!checked.ok) return { ok: false, reason: checked.problem };
  if (!isPushSendingConfigured()) return { ok: false, reason: "not_configured" };
  const admin = requireAdmin();

  const { data, error } = await admin.rpc("claim_venue_message_push", {
    p_venue_id: input.venueId,
    p_owner_id: input.ownerId,
    p_body: checked.text,
    p_daily_cap: PARTNER_MESSAGES_DAILY_CAP,
    p_max_idle_days: VENUE_NEWS_MAX_IDLE_DAYS,
  });
  if (error) throw new VenueMessagesUnavailableError(error.message || "claim failed");
  const rows = (data ?? []) as ClaimRow[];
  const outcome = rows[0]?.outcome ?? "no_audience";
  if (outcome !== "claimed") {
    console.info("[Push] venue-message-refused", { venueId: input.venueId, outcome });
    return { ok: false, reason: outcome as "paused" | "capped" | "no_audience" | "unknown_venue" };
  }

  const messageId = rows[0].message_id as string;
  const phones = rows.filter(
    (row): row is ClaimRow & { device_id: string; token: string } => Boolean(row.device_id) && Boolean(row.token),
  );
  announceAfterResponse(() => pushToPhones(input.venueId, messageId, checked.text, phones));
  return { ok: true, messageId, devices: phones.length };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isVenueMessageId = (value: unknown): value is string => typeof value === "string" && UUID_PATTERN.test(value);

export type PlayerVenueMessage = { venueId: string; venueName: string | null; body: string; sentAt: string; reported: boolean };

/** A message for a player of its bar, or null (no such message, or not their bar — same answer). */
export const readVenueMessage = async (messageId: string, userId: string): Promise<PlayerVenueMessage | null> => {
  const admin = requireAdmin();
  const { data, error } = await admin.rpc("read_venue_message", { p_message_id: messageId, p_user_id: userId });
  if (error) throw new VenueMessagesUnavailableError(error.message || "read failed");
  const row = ((data ?? []) as Array<{ venue_id: string; body: string; sent_at: string; reported: boolean }>)[0];
  if (!row) return null;
  return {
    venueId: row.venue_id,
    venueName: await getVenueDisplayName(row.venue_id),
    body: row.body,
    sentAt: row.sent_at,
    reported: row.reported,
  };
};

export type ReportVenueMessageResult = { outcome: "reported" | "already_reported" | "not_found"; paused: boolean };

/** A player reports a message. Enough reports from different people pause the bar (inside the RPC). */
export const reportVenueMessage = async (messageId: string, userId: string): Promise<ReportVenueMessageResult> => {
  const admin = requireAdmin();
  const { data, error } = await admin.rpc("report_venue_message", {
    p_message_id: messageId,
    p_user_id: userId,
    p_pause_threshold: PARTNER_MESSAGE_REPORTS_TO_PAUSE,
  });
  if (error) throw new VenueMessagesUnavailableError(error.message || "report failed");
  const row = ((data ?? []) as ReportVenueMessageResult[])[0] ?? { outcome: "not_found", paused: false };
  if (row.outcome === "reported") console.warn("[Push] venue-message-reported", { messageId, paused: row.paused });
  return row;
};

// ── Admin ────────────────────────────────────────────────────────────────────────────────────

/** `reports` = people who reported it since an admin last un-paused its bar: the number that drives a pause. */
export type AdminVenueMessage = VenueMessageSummary & { venueId: string; venueName: string | null; reports: number };
export type AdminVenuePause = { venueId: string; venueName: string | null; reason: "reports" | "admin"; pausedAt: string };

/** The admin panel: the newest messages with their report counts, and every paused bar. */
export const listVenueMessagesForAdmin = async (): Promise<{ messages: AdminVenueMessage[]; pauses: AdminVenuePause[] }> => {
  const admin = requireAdmin();
  const [messages, pauses] = await Promise.all([
    admin
      .from("push_venue_messages")
      .select("id, venue_id, body, sent_at, devices")
      .order("sent_at", { ascending: false })
      .limit(ADMIN_LIMIT),
    admin.from("push_venue_message_pauses").select("venue_id, reason, paused_at").order("paused_at", { ascending: false }),
  ]);
  if (messages.error ?? pauses.error) {
    throw new VenueMessagesUnavailableError((messages.error ?? pauses.error)?.message || "Couldn't load messages.");
  }
  const messageRows = (messages.data ?? []) as Array<{ id: string; venue_id: string; body: string; sent_at: string; devices: number }>;
  const pauseRows = (pauses.data ?? []) as Array<{ venue_id: string; reason: "reports" | "admin"; paused_at: string }>;

  const messageIds = messageRows.map((row) => row.id);
  const venueIds = [...new Set([...messageRows.map((row) => row.venue_id), ...pauseRows.map((row) => row.venue_id)])];
  const [reports, venues] = await Promise.all([
    messageIds.length
      ? admin.rpc("venue_message_report_counts", { p_message_ids: messageIds })
      : Promise.resolve({ data: [], error: null }),
    venueIds.length ? admin.from("venues").select("id, name").in("id", venueIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (isMissingFunction(reports.error, "venue_message_report_counts")) {
    console.error("[Push] report-counts-rpc-missing");
    throw new VenueMessagesUnavailableError(MIGRATION_MISSING_MESSAGE);
  }
  if (reports.error ?? venues.error) {
    throw new VenueMessagesUnavailableError((reports.error ?? venues.error)?.message || "Couldn't load messages.");
  }
  const reportCounts = new Map(
    ((reports.data ?? []) as Array<{ message_id: string; reports: number }>).map((row) => [row.message_id, row.reports]),
  );
  const names = new Map(((venues.data ?? []) as Array<{ id: string; name: string | null }>).map((row) => [row.id, row.name]));

  return {
    messages: messageRows.map((row) => ({
      id: row.id,
      venueId: row.venue_id,
      venueName: names.get(row.venue_id) ?? null,
      body: row.body,
      sentAt: row.sent_at,
      devices: row.devices,
      reports: reportCounts.get(row.id) ?? 0,
    })),
    pauses: pauseRows.map((row) => ({
      venueId: row.venue_id,
      venueName: names.get(row.venue_id) ?? null,
      reason: row.reason,
      pausedAt: row.paused_at,
    })),
  };
};

/**
 * Admin: stop a bar's messages at once, or let them send again. Un-pause is ONLY the
 * unpause_venue_messages RPC, which also marks the bar's reports reviewed — never a plain delete, or the
 * next report on an old message re-pauses the bar. A missing RPC fails closed.
 */
export const setVenueMessagesPaused = async (venueId: string, paused: boolean): Promise<void> => {
  const admin = requireAdmin();
  const { error } = paused
    ? await admin
        .from("push_venue_message_pauses")
        .upsert({ venue_id: venueId, reason: "admin", message_id: null, paused_at: new Date().toISOString() }, { onConflict: "venue_id" })
    : await admin.rpc("unpause_venue_messages", { p_venue_id: venueId });
  if (!paused && isMissingFunction(error, "unpause_venue_messages")) {
    console.error("[Push] unpause-rpc-missing", { venueId });
    throw new VenueMessagesUnavailableError(MIGRATION_MISSING_MESSAGE);
  }
  if (error) throw new VenueMessagesUnavailableError(error.message || "Couldn't change that.");
  console.warn("[Push] venue-messages-pause", { venueId, paused });
};
