import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Notification } from "@/types";

const NOTIFICATION_RETENTION_DAYS = 7;

type NotificationRow = {
  id: string;
  user_id: string;
  message: string;
  type: Notification["type"];
  read: boolean;
  created_at: string;
  link_url: string | null;
};

function mapNotificationRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    message: row.message,
    type: row.type,
    read: row.read,
    createdAt: row.created_at,
    linkUrl: row.link_url ?? undefined,
  };
}

function getNotificationRetentionCutoffIso(): string {
  const cutoffMs = Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return new Date(cutoffMs).toISOString();
}

async function purgeExpiredUserNotifications(userId: string): Promise<void> {
  if (!supabaseAdmin || !userId) {
    return;
  }
  const cutoffIso = getNotificationRetentionCutoffIso();
  await supabaseAdmin.from("notifications").delete().eq("user_id", userId).lt("created_at", cutoffIso);
}

export async function getUserNotifications(userId: string): Promise<{
  unreadCount: number;
  items: Notification[];
}> {
  const result = await listUserNotifications(userId, { limit: 50, offset: 0, unreadOnly: false });
  return {
    unreadCount: result.unreadCount,
    items: result.items,
  };
}

export async function listUserNotifications(
  userId: string,
  params: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
): Promise<{
  unreadCount: number;
  items: Notification[];
  totalItems: number;
}> {
  if (!userId || !supabaseAdmin) {
    return { unreadCount: 0, items: [], totalItems: 0 };
  }

  await purgeExpiredUserNotifications(userId);

  const limit = Math.max(1, Math.min(100, Number(params.limit ?? 50)));
  const offset = Math.max(0, Number(params.offset ?? 0));
  const unreadOnly = Boolean(params.unreadOnly);
  const cutoffIso = getNotificationRetentionCutoffIso();

  let query = supabaseAdmin
    .from("notifications")
    .select("id, user_id, message, type, read, created_at, link_url", { count: "exact" })
    .eq("user_id", userId)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false });

  if (unreadOnly) {
    query = query.eq("read", false);
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error || !data) {
    return { unreadCount: 0, items: [], totalItems: 0 };
  }

  const { count: unreadCountRaw } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", cutoffIso)
    .eq("read", false);

  const items = data.map((row) => mapNotificationRow(row as NotificationRow));
  return {
    unreadCount: Math.max(0, unreadCountRaw ?? 0),
    items,
    totalItems: Math.max(0, count ?? 0),
  };
}

export async function stampCelebrationNotifications(params: {
  userId: string;
  game: "bingo" | "fantasy" | "pickem";
}): Promise<{ celebrate: boolean; delta: number }> {
  if (!params.userId || !supabaseAdmin) {
    return { celebrate: false, delta: 0 };
  }

  const cutoffIso = getNotificationRetentionCutoffIso();
  let query = supabaseAdmin
    .from("notifications")
    .update({ animation_shown_at: new Date().toISOString() } as Record<string, unknown>)
    .eq("user_id", params.userId)
    .eq("type", "success")
    .is("animation_shown_at", null)
    .gte("created_at", cutoffIso);

  if (params.game === "bingo") {
    query = query.ilike("message", "%Bingo Board won%");
  } else if (params.game === "fantasy") {
    query = query.ilike("message", "%Your fantasy%");
  } else {
    query = query.ilike("link_url", "/pickem%");
  }

  const { data } = await query.select("id, message");

  if (!data || data.length === 0) {
    return { celebrate: false, delta: 0 };
  }

  let delta = 0;
  for (const row of data as Array<{ message: string }>) {
    const match = row.message.match(/\+(\d[\d,]*)\s*pts/i);
    if (match?.[1]) {
      delta += Number.parseInt(match[1].replace(/,/g, ""), 10);
    }
  }

  return { celebrate: true, delta };
}

export async function createNotification(params: {
  userId: string;
  message: string;
  type: Notification["type"];
  linkUrl?: string;
}): Promise<void> {
  if (!params.userId || !supabaseAdmin) return;
  await supabaseAdmin.from("notifications").insert({
    user_id: params.userId,
    message: params.message,
    type: params.type,
    read: false,
    link_url: params.linkUrl ?? null,
  });
}

export async function markNotificationsRead(params: {
  userId: string;
  notificationId?: string;
}): Promise<void> {
  if (!params.userId || !supabaseAdmin) {
    return;
  }

  await purgeExpiredUserNotifications(params.userId);

  if (params.notificationId) {
    await supabaseAdmin
      .from("notifications")
      .update({ read: true })
      .eq("user_id", params.userId)
      .eq("id", params.notificationId);
    return;
  }

  await supabaseAdmin
    .from("notifications")
    .update({ read: true })
    .eq("user_id", params.userId)
    .eq("read", false);
}
