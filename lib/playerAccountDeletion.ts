import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { authUserIsUnreferenced } from "@/lib/signupSweep";

// Player self-serve account deletion — native app store plan Phase 1b
// (docs/native-app-store-plan.md; Apple 5.1.1(v), Google Play).
//
// Two steps, in this order:
//   1. The `delete_player_account` RPC (migration 20261008044524) deletes every row of the
//      player's account in ONE transaction: all-or-nothing. Winner rows keep their slot with the
//      winner blanked; the Square gift-card ledger is kept, unlinked (Andrew, 2026-10-08).
//   2. The auth.users rows the RPC reports as unreferenced are deleted through the admin API —
//      only after `authUserIsUnreferenced` re-checks all seven consumers, and only when the auth
//      user has NO email. A player's auth user is always anonymous; one with an email is a
//      partner identity and is never touched here (CLAUDE.md: "auth.users is SHARED WITH
//      PLAYERS"). A failure in step 2 leaves an emailless, unreferenced auth row with no
//      personal data in it, so it is logged, not surfaced.

export type PlayerAccountDeletionResult =
  | { ok: true; outcome: "deleted"; authUsersDeleted: number; authUsersKept: number }
  | { ok: true; outcome: "not_found" }
  | { ok: false; error: "unconfigured" | "invalid-user-id" | "rpc-missing" | "rpc-failed" };

type RpcPayload = {
  outcome?: unknown;
  users_deleted?: unknown;
  unreferenced_auth_ids?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const deleteAnonymousAuthUser = async (authId: string): Promise<boolean> => {
  if (!supabaseAdmin) return false;

  const check = await authUserIsUnreferenced(authId);
  if (!check.ok) {
    console.error("[AccountDelete] auth-check-failed", { error: check.error });
    return false;
  }
  if (!check.unreferenced) {
    console.warn("[AccountDelete] auth-still-referenced", { referencedBy: check.referencedBy });
    return false;
  }

  const lookup = await supabaseAdmin.auth.admin.getUserById(authId);
  if (lookup.error || !lookup.data.user) {
    // Already gone is fine; anything else is logged and left.
    const status = lookup.error?.status;
    if (status === 404) return true;
    console.error("[AccountDelete] auth-lookup-failed", { message: lookup.error?.message ?? "no user" });
    return false;
  }
  if (lookup.data.user.email) {
    console.warn("[AccountDelete] auth-has-email-kept");
    return false;
  }

  const removed = await supabaseAdmin.auth.admin.deleteUser(authId);
  if (removed.error) {
    console.error("[AccountDelete] auth-delete-failed", { message: removed.error.message });
    return false;
  }
  return true;
};

export const deletePlayerAccount = async (userId: string): Promise<PlayerAccountDeletionResult> => {
  if (!supabaseAdmin) return { ok: false, error: "unconfigured" };
  const id = userId.trim();
  if (!UUID_PATTERN.test(id)) return { ok: false, error: "invalid-user-id" };

  const { data, error } = await supabaseAdmin.rpc("delete_player_account", { p_user_id: id });
  if (error) {
    // Deploy skew: the app shipped before the migration was applied. Nothing was deleted.
    const missing =
      error.code === "PGRST202" ||
      (/delete_player_account/i.test(error.message) && /not find|does not exist/i.test(error.message));
    if (missing) {
      console.error("[AccountDelete] rpc-missing");
      return { ok: false, error: "rpc-missing" };
    }
    console.error("[AccountDelete] rpc-failed", { code: error.code, message: error.message });
    return { ok: false, error: "rpc-failed" };
  }

  const payload = (data ?? {}) as RpcPayload;
  if (payload.outcome === "not_found") return { ok: true, outcome: "not_found" };
  if (payload.outcome !== "deleted") {
    console.error("[AccountDelete] rpc-unexpected-payload");
    return { ok: false, error: "rpc-failed" };
  }

  const authIds = Array.isArray(payload.unreferenced_auth_ids)
    ? payload.unreferenced_auth_ids.filter((value): value is string => typeof value === "string" && UUID_PATTERN.test(value))
    : [];

  let authUsersDeleted = 0;
  for (const authId of authIds) {
    if (await deleteAnonymousAuthUser(authId)) authUsersDeleted += 1;
  }
  const authUsersKept = authIds.length - authUsersDeleted;

  console.info("[AccountDelete] deleted", {
    usersDeleted: typeof payload.users_deleted === "number" ? payload.users_deleted : null,
    authUsersDeleted,
    authUsersKept,
  });
  return { ok: true, outcome: "deleted", authUsersDeleted, authUsersKept };
};
