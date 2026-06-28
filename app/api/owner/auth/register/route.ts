import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createOwnerSessionCookie } from "@/lib/ownerSession";

type RegisterBody = {
  email?: string;
  password?: string;
  name?: string;
  venueId?: string;
};

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as RegisterBody;
  const email = (body.email ?? "").trim().toLowerCase();
  const password = (body.password ?? "").trim();
  const name = (body.name ?? "").trim();
  const venueId = (body.venueId ?? "").trim();

  if (!email || !password || !name || !venueId) {
    return NextResponse.json({ ok: false, error: "All fields are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // Verify venue exists
  const { data: venue, error: venueError } = await supabaseAdmin
    .from("venues")
    .select("id")
    .eq("id", venueId)
    .maybeSingle<{ id: string }>();

  if (venueError || !venue) {
    return NextResponse.json({ ok: false, error: "Venue not found." }, { status: 404 });
  }

  // Check venue doesn't already have an owner
  const { data: existingOwner } = await supabaseAdmin
    .from("venue_owner_venues")
    .select("id")
    .eq("venue_id", venueId)
    .maybeSingle<{ id: string }>();

  if (existingOwner) {
    return NextResponse.json(
      { ok: false, error: "This venue already has an owner account. Contact support if you believe this is an error." },
      { status: 409 }
    );
  }

  // Create Supabase auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    if (authError?.message?.toLowerCase().includes("already registered")) {
      return NextResponse.json({ ok: false, error: "An account with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: authError?.message ?? "Failed to create account." }, { status: 500 });
  }

  const authUserId = authData.user.id;

  // Create venue_owners row
  const { data: ownerRow, error: ownerError } = await supabaseAdmin
    .from("venue_owners")
    .insert({ auth_id: authUserId, email, name })
    .select("id")
    .single<{ id: string }>();

  if (ownerError || !ownerRow) {
    // Clean up auth user if owner row creation fails
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    return NextResponse.json({ ok: false, error: "Failed to create owner profile." }, { status: 500 });
  }

  // Link owner to venue
  const { error: linkError } = await supabaseAdmin
    .from("venue_owner_venues")
    .insert({ owner_id: ownerRow.id, venue_id: venueId });

  if (linkError) {
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    return NextResponse.json({ ok: false, error: "Failed to link venue to account." }, { status: 500 });
  }

  const sessionCookie = createOwnerSessionCookie(ownerRow.id);

  return NextResponse.json(
    { ok: true, ownerId: ownerRow.id },
    { headers: { "Set-Cookie": sessionCookie } }
  );
}
