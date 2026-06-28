import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createOwnerSessionCookie } from "@/lib/ownerSession";

type Body = { accessToken?: string; newPassword?: string };

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const accessToken = (body.accessToken ?? "").trim();
  const newPassword = (body.newPassword ?? "").trim();

  if (!accessToken || !newPassword) {
    return NextResponse.json({ ok: false, error: "Missing required fields." }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ ok: false, error: "Password must be at least 8 characters." }, { status: 400 });
  }

  // Verify the access token and get the user
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return NextResponse.json({ ok: false, error: "Invalid or expired reset link. Please request a new one." }, { status: 401 });
  }

  const authUserId = userData.user.id;

  // Update password
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
    password: newPassword,
  });

  if (updateError) {
    return NextResponse.json({ ok: false, error: "Failed to update password. Please try again." }, { status: 500 });
  }

  // Look up owner row and create a session so they're logged in immediately
  const { data: ownerRow } = await supabaseAdmin
    .from("venue_owners")
    .select("id")
    .eq("auth_id", authUserId)
    .maybeSingle<{ id: string }>();

  if (!ownerRow) {
    // Password updated but no owner profile — just redirect to login
    return NextResponse.json({ ok: true, redirect: "/owner/login" });
  }

  const sessionCookie = createOwnerSessionCookie(ownerRow.id);
  return NextResponse.json(
    { ok: true, redirect: "/owner/dashboard" },
    { headers: { "Set-Cookie": sessionCookie } }
  );
}
