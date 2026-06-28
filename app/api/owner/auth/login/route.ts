import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createOwnerSessionCookie } from "@/lib/ownerSession";

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
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }

  const authData = (await authResponse.json()) as { user?: { id?: string } };
  const authUserId = authData.user?.id;

  if (!authUserId) {
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }

  // Look up venue_owners row by auth_id
  const { data: ownerRow, error: ownerError } = await supabaseAdmin
    .from("venue_owners")
    .select("id, name, email")
    .eq("auth_id", authUserId)
    .maybeSingle<{ id: string; name: string; email: string }>();

  if (ownerError || !ownerRow) {
    return NextResponse.json({ ok: false, error: "No owner account found for this email." }, { status: 404 });
  }

  const sessionCookie = createOwnerSessionCookie(ownerRow.id);

  return NextResponse.json(
    { ok: true, owner: { id: ownerRow.id, name: ownerRow.name, email: ownerRow.email } },
    { headers: { "Set-Cookie": sessionCookie } }
  );
}
