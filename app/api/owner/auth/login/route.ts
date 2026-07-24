import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createOwnerSessionCookie } from "@/lib/ownerSession";

const INVALID_LOGIN_MESSAGE = "Invalid email or password.";

type LoginBody = {
  email?: string;
  password?: string;
};

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as LoginBody;
  const email = (body.email ?? "").trim().toLowerCase();
  const password = (body.password ?? "").trim();

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
  }

  // Verify credentials via Supabase auth REST API
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseAnonKey,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!authResponse.ok) {
    return NextResponse.json({ ok: false, error: INVALID_LOGIN_MESSAGE }, { status: 401 });
  }

  const authData = (await authResponse.json()) as { user?: { id?: string } };
  const authUserId = authData.user?.id;

  if (!authUserId) {
    return NextResponse.json({ ok: false, error: INVALID_LOGIN_MESSAGE }, { status: 401 });
  }

  // Look up venue_owners row by auth_id
  const { data: ownerRow, error: ownerError } = await supabaseAdmin
    .from("venue_owners")
    .select("id, name, email")
    .eq("auth_id", authUserId)
    .maybeSingle<{ id: string; name: string; email: string }>();

  if (ownerError) {
    return NextResponse.json({ ok: false, error: "Failed to load owner account." }, { status: 500 });
  }

  if (!ownerRow) {
    return NextResponse.json({ ok: false, error: INVALID_LOGIN_MESSAGE }, { status: 401 });
  }

  const { data: ownerVenueLinks, error: ownerVenueError } = await supabaseAdmin
    .from("venue_owner_venues")
    .select("venue_id")
    .eq("owner_id", ownerRow.id)
    .limit(100);

  if (ownerVenueError) {
    return NextResponse.json({ ok: false, error: "Failed to load owner venues." }, { status: 500 });
  }

  const ownerVenueIds = (ownerVenueLinks ?? [])
    .map((link) => String(link.venue_id ?? "").trim())
    .filter(Boolean);
  let hasLiveVenue = false;
  if (ownerVenueIds.length > 0) {
    const { data: liveVenues, error: liveVenueError } = await supabaseAdmin
      .from("venues")
      .select("id")
      .in("id", ownerVenueIds)
      .limit(1);
    if (liveVenueError) {
      return NextResponse.json({ ok: false, error: "Failed to load owner venues." }, { status: 500 });
    }
    hasLiveVenue = (liveVenues ?? []).length > 0;
  }

  if (!hasLiveVenue) {
    const { error: linkDeleteError } = await supabaseAdmin.from("venue_owner_venues").delete().eq("owner_id", ownerRow.id);
    if (linkDeleteError) {
      console.error(
        `Owner login rejected for orphaned owner ${ownerRow.id}, but failed to delete stale venue links:`,
        linkDeleteError.message
      );
    }

    try {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
    } catch (error) {
      console.error(
        `Owner login rejected for orphaned owner ${ownerRow.id}, but failed to delete auth user ${authUserId}:`,
        error instanceof Error ? error.message : String(error)
      );
    }

    const { error: ownerDeleteError } = await supabaseAdmin.from("venue_owners").delete().eq("id", ownerRow.id);
    if (ownerDeleteError) {
      console.error(
        `Owner login rejected for orphaned owner ${ownerRow.id}, but failed to delete owner row:`,
        ownerDeleteError.message
      );
    }

    return NextResponse.json({ ok: false, error: INVALID_LOGIN_MESSAGE }, { status: 401 });
  }

  const sessionCookie = createOwnerSessionCookie(ownerRow.id);

  return NextResponse.json(
    { ok: true, owner: { id: ownerRow.id, name: ownerRow.name, email: ownerRow.email } },
    { headers: { "Set-Cookie": sessionCookie } }
  );
}
