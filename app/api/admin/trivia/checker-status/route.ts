import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "node:crypto";
import { signText } from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import { prerequisites } from "@/lib/speed-trivia-uniqueness/diagnostics.cjs";

export const GET = async (request: Request) => {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const local = prerequisites();
  const probe = "speed-variety-prerequisite:" + randomUUID();
  const result = supabaseAdmin && local.checks.signingKey ? await supabaseAdmin.rpc("speed_trivia_variety_prerequisites", { p_probe: probe, p_signature: signText(process.env.SPEED_TRIVIA_ADMISSION_SECRET!, probe) }) : null;
  const databaseReady = Boolean(result && !result.error && result.data?.configured && result.data?.subjectPolicy === local.subjectPolicy);
  return NextResponse.json({ ok: true, ...local, ready: local.ready && databaseReady, databaseReady }, { headers: { "Cache-Control": "no-store" } });
};
