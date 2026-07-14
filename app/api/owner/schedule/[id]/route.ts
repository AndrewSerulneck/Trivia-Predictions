import { NextResponse } from "next/server";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { deleteOwnerSchedule, getOwnerSchedule, ownsVenue } from "@/lib/ownerSchedule";

/** DELETE /api/owner/schedule/[id] — remove a schedule the owner controls. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  try {
    const { id } = await params;

    // Resolve the schedule first so we can enforce venue ownership before
    // deleting anything. A missing schedule is a 404; one the owner doesn't own
    // is a 403 (and we never reveal it exists via a different code path).
    const schedule = await getOwnerSchedule(id);
    if (!schedule) {
      return NextResponse.json({ ok: false, error: "Schedule not found." }, { status: 404 });
    }
    if (!ownsVenue(auth, schedule.venueId)) {
      return NextResponse.json(
        { ok: false, error: "You do not have access to this venue." },
        { status: 403 },
      );
    }

    await deleteOwnerSchedule(schedule);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete schedule." },
      { status: 500 },
    );
  }
}
