import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Body = { email?: string };

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Server configuration error." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const email = (body.email ?? "").trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim() ?? "";
  const redirectTo = baseUrl ? `${baseUrl}/owner/reset-password` : "/owner/reset-password";

  // Send reset email via Supabase — always return ok to avoid leaking whether email exists
  await supabaseAdmin.auth.resetPasswordForEmail(email, { redirectTo });

  return NextResponse.json({ ok: true });
}
