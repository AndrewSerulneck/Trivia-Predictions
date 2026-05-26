import { NextResponse } from "next/server";
import { findMatchingAdminCredential, getConfiguredAdminCredentials } from "@/lib/adminCredentials";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionCookie,
  getCookieValue,
  validateAdminSessionToken,
} from "@/lib/adminSession";

export async function GET(request: Request) {
  const configuredCredentials = getConfiguredAdminCredentials();
  if (configuredCredentials.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Admin login credentials are not configured." },
      { status: 500 }
    );
  }

  const adminSession = getCookieValue(request, ADMIN_SESSION_COOKIE);
  if (
    adminSession &&
    configuredCredentials.some((credential) =>
      validateAdminSessionToken(adminSession, credential.username)
    )
  ) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Admin login required." }, { status: 401 });
}

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

  const setCookieValue = createAdminSessionCookie(matchedCredential.username);
  if (!setCookieValue) {
    return NextResponse.json({ ok: false, error: "Failed to create admin session." }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  response.headers.append("Set-Cookie", setCookieValue);
  return response;
}
