import { NextResponse } from "next/server";
import { refreshFantasyProgress } from "@/lib/fantasy";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const bearer = request.headers.get("authorization") ?? "";
    if (bearer.toLowerCase() === `bearer ${secret.toLowerCase()}`) {
      return true;
    }

    const headerSecret = request.headers.get("x-cron-secret") ?? "";
    return headerSecret === secret;
  }

  const vercelCronHeader = request.headers.get("x-vercel-cron")?.trim() ?? "";
  return vercelCronHeader.length > 0;
}

async function triggerLiveStatsSyncFromCron(): Promise<void> {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!projectUrl || !serviceRole) {
    return;
  }
  const endpoint = `${projectUrl.replace(/\/+$/, "")}/functions/v1/sync-live-player-stats`;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
      cache: "no-store",
    });
  } catch {
    // Non-blocking: scoring refresh can still run against existing rows.
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    await triggerLiveStatsSyncFromCron();
    const result = await refreshFantasyProgress({ limit: 500 });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Fantasy cron refresh failed.",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
