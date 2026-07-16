import { NextResponse } from "next/server";
import { runContinuousCategoryBlitzEngine } from "@/lib/categoryBlitz";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const bearer = request.headers.get("authorization") ?? "";
    if (bearer.toLowerCase() === `bearer ${secret.toLowerCase()}`) return true;
    const headerSecret = request.headers.get("x-cron-secret") ?? "";
    return headerSecret === secret;
  }
  return false;
}

/**
 * Drives every venue with continuous Category Blitz mode enabled: scores expired
 * rounds and starts the next one once its intermission has elapsed. Mirrors the
 * scheduled engine's cron (category-blitz-score) so rounds keep advancing even
 * when no player is actively polling the sessions endpoint.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const result = await runContinuousCategoryBlitzEngine();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Continuous Category Blitz cron engine failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
