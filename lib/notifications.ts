import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Notification } from "@/types";

type NotificationRow = {
  id: string;
  user_id: string;
  message: string;
  type: Notification["type"];
  read: boolean;
  created_at: string;
};

function mapNotificationRow(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    message: row.message,
    type: row.type,
    read: row.read,
    createdAt: row.created_at,
  };
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

  const limit = Math.max(1, Math.min(100, Number(params.limit ?? 50)));
  const offset = Math.max(0, Number(params.offset ?? 0));
  const unreadOnly = Boolean(params.unreadOnly);

  let query = supabaseAdmin
    .from("notifications")
    .select("id, user_id, message, type, read, created_at", { count: "exact" })
    .eq("user_id", userId)
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
    .eq("read", false);

  const items = data.map((row) => mapNotificationRow(row as NotificationRow));
  return {
    unreadCount: Math.max(0, unreadCountRaw ?? 0),
    items,
    totalItems: Math.max(0, count ?? 0),
  };
}

export async function markNotificationsRead(params: {
  userId: string;
  notificationId?: string;
}): Promise<void> {
  if (!params.userId || !supabaseAdmin) {
    return;
  }

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
