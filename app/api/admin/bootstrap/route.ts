import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token || null;
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  const configuredUsername = process.env.ADMIN_LOGIN_USERNAME?.trim();
  const configuredPassword = process.env.ADMIN_LOGIN_PASSWORD?.trim();
  if (!configuredUsername || !configuredPassword) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_LOGIN_USERNAME and ADMIN_LOGIN_PASSWORD must be configured." },
      { status: 500 }
    );
  }

  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing bearer token." }, { status: 401 });
  }

  const { username, password } = (await request.json()) as { username?: string; password?: string };
  if ((username ?? "").trim() !== configuredUsername || (password ?? "") !== configuredPassword) {
    return NextResponse.json({ ok: false, error: "Invalid admin login credentials." }, { status: 403 });
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const authUserId = authData.user?.id;
  if (authError || !authUserId) {
    return NextResponse.json({ ok: false, error: "Invalid auth token." }, { status: 401 });
  }

  const { data: users, error: userError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("auth_id", authUserId)
    .limit(1000);

  if (userError) {
    return NextResponse.json({ ok: false, error: userError.message }, { status: 500 });
  }

  if (!users || users.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No user profile found for this account. Join a venue first, then retry." },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("users")
    .update({ is_admin: true })
    .eq("auth_id", authUserId);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, promotedProfiles: users.length });
}
