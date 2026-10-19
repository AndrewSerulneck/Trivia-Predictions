import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getSquaresAdminOverview, parseSquaresAdminAction, runSquaresAdminAction } from "@/lib/squaresAdmin";

// Admin panel for the Squares engine (lib/squaresAdmin.ts). Admin-only and deliberately NOT behind
// NEXT_PUBLIC_SQUARES_ENABLED, so the event can be checked (and a rehearsal set up) before launch.

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const result = await getSquaresAdminOverview();
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true, overview: result.overview }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const parsed = parseSquaresAdminAction(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400, headers: NO_STORE });
  const result = await runSquaresAdminAction(parsed, auth.adminUsername ?? "admin");
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status, headers: NO_STORE });
  return NextResponse.json(result, { headers: NO_STORE });
}
