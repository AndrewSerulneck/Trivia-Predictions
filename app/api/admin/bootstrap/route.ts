import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/adminSession";

export async function POST(request: Request) {
  const configuredUsername = process.env.ADMIN_LOGIN_USERNAME?.trim();
  const configuredPassword = process.env.ADMIN_LOGIN_PASSWORD?.trim();
  if (!configuredUsername || !configuredPassword) {
    return NextResponse.json(
      { ok: false, error: "ADMIN_LOGIN_USERNAME and ADMIN_LOGIN_PASSWORD must be configured." },
      { status: 500 }
    );
  }

  const { username, password } = (await request.json()) as { username?: string; password?: string };
  if ((username ?? "").trim() !== configuredUsername || (password ?? "") !== configuredPassword) {
    return NextResponse.json({ ok: false, error: "Invalid admin login credentials." }, { status: 403 });
  }

  const sessionToken = createAdminSessionToken(configuredUsername);
  if (!sessionToken) {
    return NextResponse.json({ ok: false, error: "Failed to create admin session." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
