import { NextResponse } from "next/server";
import { DELETE_CONFIRMATION_WORD } from "@/lib/accountDeletionShared";
import { deletePlayerAccount } from "@/lib/playerAccountDeletion";
import { clearSessionCookie, isSessionEnforced, resolveRequestUserId } from "@/lib/serverSession";

// POST /api/account/delete — a player deletes their own account (native app store plan
// Phase 1b; Apple 5.1.1(v), Google Play). Body: { userId?: string, confirm: "DELETE" }.
//
// The account to delete is the SIGNED tp_sess session's, never the body's: a body userId that
// differs from the session is 403, exactly like every other player route (resolveRequestUserId).
//
// Refuses outright (503) when sessions are not enforced. Without SESSION_SECRET there is nothing
// to verify a claim against, and the local dev server talks to the PRODUCTION database — an
// unverified claim must never be able to delete a real player.

type DeleteBody = { userId?: unknown; confirm?: unknown };

export async function POST(request: Request) {
  if (!isSessionEnforced()) {
    console.error("[AccountDelete] session-not-enforced");
    return NextResponse.json(
      { ok: false, error: "Account deletion is unavailable right now. Please contact support." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as DeleteBody;
  const confirm = typeof body.confirm === "string" ? body.confirm.trim().toUpperCase() : "";
  if (confirm !== DELETE_CONFIRMATION_WORD) {
    return NextResponse.json(
      { ok: false, error: `Type ${DELETE_CONFIRMATION_WORD} to confirm.` },
      { status: 400 }
    );
  }

  const claimed = typeof body.userId === "string" ? body.userId : null;
  const { userId, forbidden } = resolveRequestUserId(request, claimed);
  if (forbidden) {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Please sign in again to delete your account." }, { status: 401 });
  }

  const result = await deletePlayerAccount(userId);
  if (!result.ok) {
    const status = result.error === "invalid-user-id" ? 400 : result.error === "rpc-failed" ? 500 : 503;
    return NextResponse.json(
      { ok: false, error: "We couldn't delete your account. Nothing was changed. Please try again or contact support." },
      { status }
    );
  }

  // Deleted now, or already gone: either way the session points at nothing, so expire it here
  // even if the client never gets to run its own sign-out.
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie());
  return NextResponse.json({ ok: true, alreadyDeleted: result.outcome === "not_found" }, { headers });
}
