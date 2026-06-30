import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ScategoriesRound } from "@/types";

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

/** GET /api/scategories/sessions/[id]/current-round — fetch the latest round for a session */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: sessionId } = await params;
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Service unavailable." }, { status: 503 });
    }

    const { data, error } = await supabaseAdmin
      .from("scategories_rounds")
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

    const round: ScategoriesRound = {
      id: data.id,
      sessionId: data.session_id,
      venueId: data.venue_id,
      letter: data.letter,
      categorySetIndex: data.category_set_index,
      categories: Array.isArray(data.categories) ? data.categories : [],
      startedAt: data.started_at,
      endsAt: data.ends_at,
      status: data.status as ScategoriesRound["status"],
      createdAt: data.created_at,
    };

    return NextResponse.json({ ok: true, round });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load round." },
      { status: 500 }
    );
  }
}
