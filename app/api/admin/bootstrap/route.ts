import { NextResponse } from "next/server";
import { findMatchingAdminCredential, getConfiguredAdminCredentials } from "@/lib/adminCredentials";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/adminSession";

export async function POST(request: Request) {
  const configuredCredentials = getConfiguredAdminCredentials();
  if (configuredCredentials.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Admin login credentials are not configured." },
      { status: 500 }
    );
  }

  const { username, password } = (await request.json()) as { username?: string; password?: string };
  const matchedCredential = findMatchingAdminCredential({ username, password });
  if (!matchedCredential) {
    return NextResponse.json({ ok: false, error: "Invalid admin login credentials." }, { status: 403 });
  }

  const sessionToken = createAdminSessionToken(matchedCredential.username);
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
  });
  return response;
}
