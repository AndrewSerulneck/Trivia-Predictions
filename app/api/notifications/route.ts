import { NextResponse } from "next/server";
import { getUserNotifications, markNotificationsRead } from "@/lib/notifications";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") ?? "").trim();
  const data = await getUserNotifications(userId);
  return NextResponse.json({ ok: true, ...data });
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
