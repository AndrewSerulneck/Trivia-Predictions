import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { deleteSchedule } from "@/lib/scategoriesSchedules";

/** DELETE /api/scategories/schedules/[id] — soft-delete a schedule (admin only) */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    await deleteSchedule(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete schedule." },
      { status: 500 }
    );
  }
}
