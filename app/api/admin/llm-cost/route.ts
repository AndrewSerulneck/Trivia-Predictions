import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { getCostSummary } from "@/lib/llmCostTracker";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: auth.status });
  }

  const url = new URL(request.url);
  const range = (url.searchParams.get("range") ?? "month") as "today" | "week" | "month" | "all";

  if (!["today", "week", "month", "all"].includes(range)) {
    return NextResponse.json({ ok: false, error: "Invalid range parameter." }, { status: 400 });
  }

  try {
    const summary = await getCostSummary(range);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
