import { NextResponse } from "next/server";
import { updateAdminUser } from "@/lib/admin";
import { requireAdminAuth } from "@/lib/adminAuth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const routeParams = await params;
  const userId = (routeParams.userId ?? "").trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { username?: string; points?: number };
    const user = await updateAdminUser({
      userId,
      username: body.username,
      points: body.points,
    });
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update user." },
      { status: 500 }
    );
  }
}
