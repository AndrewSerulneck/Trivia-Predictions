import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

export async function requireAdminAuth(request: Request): Promise<AdminAuthResult> {
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
