import { ADMIN_SESSION_COOKIE, getCookieValue, validateAdminSessionToken } from "@/lib/adminSession";

type AdminAuthResult =
  | { ok: true; authUserId: string }
  | { ok: false; status: number; error: string };

function getConfiguredAdminCredentials(): { username: string; password: string } | null {
  const configuredUsername = process.env.ADMIN_LOGIN_USERNAME?.trim();
  const configuredPassword = process.env.ADMIN_LOGIN_PASSWORD?.trim();
  if (!configuredUsername || !configuredPassword) {
    return null;
  }
  return { username: configuredUsername, password: configuredPassword };
}

export async function requireAdminAuth(request: Request): Promise<AdminAuthResult> {
  const configured = getConfiguredAdminCredentials();

  if (!configured) {
    return { ok: false, status: 500, error: "Admin login credentials are not configured." };
  }

  // Allow an active signed admin session cookie.
  const adminSession = getCookieValue(request, ADMIN_SESSION_COOKIE);
  if (adminSession && validateAdminSessionToken(adminSession, configured.username)) {
    return { ok: true, authUserId: "admin-session-cookie" };
  }

  return { ok: false, status: 401, error: "Admin login required." };
}
