import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { deleteOwnerCompetition } from "@/lib/ownerCompetitions";

/** DELETE /api/owner/competitions/[id] — end a competition the owner created. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  try {
    const { id } = await params;
    const result = await deleteOwnerCompetition(id, auth);
    if (result.ok) {
      return NextResponse.json({ ok: true });
    }
    // not_found → 404; forbidden (not the creator, or a venue the owner doesn't
    // control) → 403. Mirrors the Phase 4 schedule DELETE.
    if (result.reason === "not_found") {
      return NextResponse.json({ ok: false, error: "Competition not found." }, { status: 404 });
    }
    return NextResponse.json(
      { ok: false, error: "You do not have access to this competition." },
      { status: 403 },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete competition." },
      { status: 500 },
    );
  }
}
