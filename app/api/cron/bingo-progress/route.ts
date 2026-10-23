import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cronAuth";
import { sendPendingNotificationPushes } from "@/lib/push/outbox";
import { refreshSportsBingoProgress } from "@/lib/sportsBingo";

// Per-minute: the Sports Bingo refresh, then the phone-push outbox (docs/native-app-store-plan.md
// Phase 5.1, lib/push/outbox.ts) — after the refresh, so a Bingo win graded in this run is pushed in
// the same minute. Each runs in its own try/catch: one throwing never stops the other, and either
// throwing makes the response a 500 with `ok: false`.

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  let result: Awaited<ReturnType<typeof refreshSportsBingoProgress>> | null = null;
  let bingoError: string | null = null;
  try {
    result = await refreshSportsBingoProgress({ limit: 500 });
  } catch (error) {
    bingoError = error instanceof Error ? error.message : "Sports Bingo cron refresh failed.";
  }

  let push: Awaited<ReturnType<typeof sendPendingNotificationPushes>> | { error: string } | null = null;
  try {
    push = await sendPendingNotificationPushes();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push outbox failed.";
    console.error("[Push] outbox-failed", { message });
    push = { error: message };
  }

  const ok = bingoError === null && !(push && "error" in push);
  return NextResponse.json(
    {
      ok,
      ...(bingoError === null ? { result } : { error: bingoError }),
      push,
    },
    { status: ok ? 200 : 500 }
  );
}

export async function GET(request: Request) {
  return POST(request);
}
