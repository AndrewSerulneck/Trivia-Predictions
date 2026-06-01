import { getConfiguredAdminCredentials } from "@/lib/adminCredentials";
import { ADMIN_SESSION_COOKIE, getCookieValue, validateAdminSessionToken } from "@/lib/adminSession";

type AdminAuthResult =
  | { ok: true; authUserId: string; adminUsername: string }
  | { ok: false; status: number; error: string };

export async function requireAdminAuth(request: Request): Promise<AdminAuthResult> {
  const configuredCredentials = getConfiguredAdminCredentials();
  if (configuredCredentials.length === 0) {
    return { ok: false, status: 500, error: "Admin login credentials are not configured." };
  }

  // Allow an active signed admin session cookie.
  const adminSession = getCookieValue(request, ADMIN_SESSION_COOKIE);
  if (adminSession) {
    const credential = configuredCredentials.find((item) =>
      validateAdminSessionToken(adminSession, item.username)
    );
    if (credential) {
      return {
        ok: true,
        authUserId: "admin-session-cookie",
        adminUsername: credential.username,
      };
    }
  }

  return { ok: false, status: 401, error: "Admin login required." };
}
