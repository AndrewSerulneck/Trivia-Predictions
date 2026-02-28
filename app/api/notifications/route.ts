import { NextResponse } from "next/server";
import { getUserNotifications, listUserNotifications, markNotificationsRead } from "@/lib/notifications";

function normalizePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") ?? "").trim();
  const pageSize = Math.max(1, Math.min(100, normalizePositiveInt(searchParams.get("pageSize"), 50)));
  const page = Math.max(1, normalizePositiveInt(searchParams.get("page"), 1));
  const unreadOnly = (searchParams.get("filter") ?? "all").trim().toLowerCase() === "unread";
  const hasPagingParams = searchParams.has("page") || searchParams.has("pageSize") || searchParams.has("filter");

  if (!hasPagingParams) {
    const data = await getUserNotifications(userId);
    return NextResponse.json({ ok: true, ...data });
  }

  const offset = (page - 1) * pageSize;
  const data = await listUserNotifications(userId, {
    limit: pageSize,
    offset,
    unreadOnly,
  });
  const totalPages = Math.max(1, Math.ceil(data.totalItems / pageSize));

  return NextResponse.json({
    ok: true,
    unreadCount: data.unreadCount,
    items: data.items,
    page: Math.min(page, totalPages),
    pageSize,
    totalItems: data.totalItems,
    totalPages,
    filter: unreadOnly ? "unread" : "all",
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { userId?: string; notificationId?: string };
    const userId = body.userId?.trim() ?? "";

    if (!userId) {
      return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
    }

    await markNotificationsRead({
      userId,
      notificationId: body.notificationId?.trim() || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to mark notifications as read." },
      { status: 500 }
    );
  }
}
