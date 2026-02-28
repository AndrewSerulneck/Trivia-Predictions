import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type UserSummaryRow = {
  username: string;
  points: number;
  venue_id: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") ?? "").trim();
  const venueId = (searchParams.get("venueId") ?? "").trim();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ ok: true, profile: null });
  }

  let query = supabaseAdmin.from("users").select("username, points, venue_id").eq("id", userId);
  if (venueId) {
    query = query.eq("venue_id", venueId);
  }

  const { data, error } = await query.maybeSingle<UserSummaryRow>();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: true, profile: null });
  }

  return NextResponse.json({
    ok: true,
    profile: {
      username: data.username,
      points: data.points,
      venueId: data.venue_id,
    },
  });
}
