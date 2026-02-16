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
  if (!userId || !supabaseAdmin) {
    return { unreadCount: 0, items: [] };
  }

  const { data, error } = await supabaseAdmin
    .from("notifications")
    .select("id, user_id, message, type, read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    return { unreadCount: 0, items: [] };
  }

  const items = data.map((row) => mapNotificationRow(row as NotificationRow));
  const unreadCount = items.filter((item) => !item.read).length;
  return { unreadCount, items };
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
