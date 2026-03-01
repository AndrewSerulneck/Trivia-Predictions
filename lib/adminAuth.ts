import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ADMIN_SESSION_COOKIE, getCookieValue, validateAdminSessionToken } from "@/lib/adminSession";

type AdminAuthResult =
  | { ok: true; authUserId: string }
  | { ok: false; status: number; error: string };

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token || null;
}

function getConfiguredAdminCredentials(): { username: string; password: string } | null {
  const configuredUsername = process.env.ADMIN_LOGIN_USERNAME?.trim();
  const configuredPassword = process.env.ADMIN_LOGIN_PASSWORD?.trim();
  if (!configuredUsername || !configuredPassword) {
    return null;
  }
  return { username: configuredUsername, password: configuredPassword };
}

function isConfiguredAdminCredentialAuth(request: Request): boolean {
  const configured = getConfiguredAdminCredentials();
  if (!configured) {
    return false;
  }
  const username = (request.headers.get("x-admin-username") ?? "").trim();
  const password = request.headers.get("x-admin-password") ?? "";
  return username === configured.username && password === configured.password;
}

export async function requireAdminAuth(request: Request): Promise<AdminAuthResult> {
  const configured = getConfiguredAdminCredentials();

  // Allow an active signed admin session cookie.
  if (configured) {
    const adminSession = getCookieValue(request, ADMIN_SESSION_COOKIE);
    if (adminSession && validateAdminSessionToken(adminSession, configured.username)) {
      return { ok: true, authUserId: "admin-session-cookie" };
    }
  }

  // Allow explicit admin credential login without requiring a venue user profile.
  if (isConfiguredAdminCredentialAuth(request)) {
    return { ok: true, authUserId: "admin-credential-login" };
  }

  if (!supabaseAdmin) {
    return { ok: false, status: 500, error: "Supabase admin client is not configured." };
  }

  const token = getBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token." };
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const authUserId = authData.user?.id;
  if (authError || !authUserId) {
    return { ok: false, status: 401, error: "Invalid auth token." };
  }

  const { data: adminRows, error: adminError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("auth_id", authUserId)
    .eq("is_admin", true)
    .limit(1);

  if (adminError) {
    return { ok: false, status: 500, error: adminError.message };
  }

  if (!adminRows || adminRows.length === 0) {
    return { ok: false, status: 403, error: "Admin privileges required." };
  }

  return { ok: true, authUserId };
}
