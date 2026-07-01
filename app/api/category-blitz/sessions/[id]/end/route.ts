import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { endSession } from "@/lib/categoryBlitz";

/** POST /api/category-blitz/sessions/[id]/end — end a session early (admin only) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    await endSession(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to end session." },
      { status: 500 }
    );
  }
}
