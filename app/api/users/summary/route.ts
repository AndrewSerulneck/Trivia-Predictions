import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type UserSummaryRow = {
  username: string;
  points: number;
  venue_id: string;
  account_id: string | null;
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

  let query = supabaseAdmin.from("users").select("username, points, venue_id, account_id").eq("id", userId);
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

  // Check whether this user has at least one enrolled passkey. Prefer the account-level
  // lookup (new system) but fall back to user-level for legacy rows without account_id.
  let hasPasskey = false;
  if (data.account_id) {
    const { count } = await supabaseAdmin
      .from("user_passkeys")
      .select("id", { count: "exact", head: true })
      .eq("account_id", data.account_id);
    hasPasskey = (count ?? 0) > 0;
  } else {
    const { count } = await supabaseAdmin
      .from("user_passkeys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    hasPasskey = (count ?? 0) > 0;
  }

  return NextResponse.json({
    ok: true,
    profile: {
      username: data.username,
      points: data.points,
      venueId: data.venue_id,
    },
    hasPasskey,
  });
}
