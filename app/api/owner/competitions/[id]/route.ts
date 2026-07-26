import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import {
  deleteOwnerCompetition,
  getOwnerCompetitionRedemptionCounts,
} from "@/lib/ownerCompetitions";

/** not_found → 404; forbidden (not the creator, or a venue the owner doesn't control) → 403. */
function denial(reason: "not_found" | "forbidden") {
  return reason === "not_found"
    ? NextResponse.json({ ok: false, error: "Competition not found." }, { status: 404 })
    : NextResponse.json(
        { ok: false, error: "You do not have access to this competition." },
        { status: 403 },
      );
}

/**
 * GET /api/owner/competitions/[id] — the prize counts behind the delete confirm.
 *
 * The partner has to be told what a hard delete would cost ("3 prizes awarded, 1
 * still unredeemed") while they are still choosing, so this is read before the
 * DELETE rather than derived from its response.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  try {
    const { id } = await params;
    const result = await getOwnerCompetitionRedemptionCounts(id, auth);
    if (!result.ok) return denial(result.reason);
    return NextResponse.json({ ok: true, counts: result.counts });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load prize counts." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/owner/competitions/[id] — remove a competition the owner created.
 *
 * `?mode=delete` really deletes it: unredeemed coupons are voided, already-redeemed
 * ones survive as detached history. Anything else archives (`is_active = false`),
 * which keeps every awarded coupon working. Archive is the default precisely
 * because it is the recoverable one — a caller that forgets the parameter gets the
 * safe behavior, not the destructive one.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  try {
    const { id } = await params;
    const mode =
      new URL(request.url).searchParams.get("mode") === "delete" ? "delete" : "archive";
    const result = await deleteOwnerCompetition(id, auth, mode);
    if (!result.ok) return denial(result.reason);
    // The outcome is reported, never inferred: the caller asked for a mode, and
    // this says what actually happened to the reward and its coupons.
    return NextResponse.json({ ok: true, ...result.result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete competition." },
      { status: 500 },
    );
  }
}
