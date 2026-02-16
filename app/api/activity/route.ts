import { NextResponse } from "next/server";
import { getUserActivity } from "@/lib/activity";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId") ?? "";

  if (!userId) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const items = await getUserActivity(userId);
  return NextResponse.json({ ok: true, items });
}
