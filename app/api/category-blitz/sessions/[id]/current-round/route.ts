import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getViewerRoleForRound } from "@/lib/categoryBlitz";
import { isSessionEnforced, readSession } from "@/lib/serverSession";
import type { CategoryBlitzRound, CategoryBlitzViewerRole } from "@/types";

type RoundRow = {
  id: string;
  session_id: string;
  venue_id: string;
  letter: string;
  category_set_index: number;
  categories: string[];
  started_at: string;
  ends_at: string;
  status: string;
  created_at: string;
};

/** GET /api/category-blitz/sessions/[id]/current-round — fetch the latest round for a session */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Service unavailable." }, { status: 503 });
    }

    const { data, error } = await supabaseAdmin
      .from("category_blitz_rounds")
      .select(
        "id, session_id, venue_id, letter, category_set_index, categories, started_at, ends_at, status, created_at"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<RoundRow>();

    if (error) throw new Error(error.message);

    if (!data) {
      return NextResponse.json({ ok: true, round: null });
    }

    const round: CategoryBlitzRound = {
      id: data.id,
      sessionId: data.session_id,
      venueId: data.venue_id,
      letter: data.letter,
      categorySetIndex: data.category_set_index,
      categories: Array.isArray(data.categories) ? data.categories : [],
      startedAt: data.started_at,
      endsAt: data.ends_at,
      status: data.status as CategoryBlitzRound["status"],
      createdAt: data.created_at,
    };

    let viewerRole: CategoryBlitzViewerRole | null = null;
    if (round.status !== "complete") {
      const { searchParams } = new URL(request.url);
      const requestedUserId = (searchParams.get("userId") ?? "").trim();
      const sessionUserId = readSession(request);
      const resolvedUserId = isSessionEnforced()
        ? sessionUserId && sessionUserId === requestedUserId ? sessionUserId : ""
        : requestedUserId;
      if (resolvedUserId) {
        viewerRole = await getViewerRoleForRound(round.sessionId, resolvedUserId, round.startedAt);
      }
    }

    return NextResponse.json({ ok: true, round, viewerRole });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load round." },
      { status: 500 }
    );
  }
}
