import { NextResponse } from "next/server";
import { getUserActivity } from "@/lib/activity";
import { isSessionEnforced, readSession } from "@/lib/serverSession";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedUserId = (searchParams.get("userId") ?? "").trim();

  if (!requestedUserId) {
    return NextResponse.json({ ok: true, items: [] });
  }

  const sessionUserId = readSession(request);
  if (isSessionEnforced()) {
    if (!sessionUserId || sessionUserId !== requestedUserId) {
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
  }

  const items = await getUserActivity(requestedUserId);
  return NextResponse.json({ ok: true, items });
}
