import { NextResponse } from "next/server";
import { autoSettleResolvedPredictionMarkets } from "@/lib/admin";

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

  // Fallback for Vercel Cron in environments where CRON_SECRET was not set yet.
  // Vercel includes this header on cron invocations.
  const vercelCronHeader = request.headers.get("x-vercel-cron")?.trim() ?? "";
  return vercelCronHeader.length > 0;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const result = await autoSettleResolvedPredictionMarkets();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Cron settlement failed." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
