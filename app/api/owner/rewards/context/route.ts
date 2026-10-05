import { NextResponse } from "next/server";
import { venueHasActivePos } from "@/lib/pos/connections";
import { requireOwnerAuth } from "@/lib/requireOwnerAuth";
import { REWARD_UNKNOWN_DEFINITION_MESSAGE, resolveRewardCreationContext } from "@/lib/rewards";

/**
 * GET /api/owner/rewards/context?venueId=&definitionId= — whether the chosen
 * reward's required game is scheduled at this venue, and which cadences the
 * wizard may offer. Drives wizard Step 2 (cadence gating) in
 * components/rewards/CreateRewardWizard.tsx.
 */
export async function GET(request: Request) {
  let auth;
  try {
    auth = await requireOwnerAuth(request);
  } catch (response) {
    return response as Response;
  }

  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venueId")?.trim() ?? "";
  const definitionId = searchParams.get("definitionId")?.trim() ?? "";

  if (!venueId) return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
  if (!auth.venueIds.includes(venueId)) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this venue." },
      { status: 403 },
    );
  }

  try {
    // posConnected (POS plan Phase 1): the wizard asks a percent-off prize's value at the
    // register only when the venue has a live POS connection.
    const [resolved, posConnected] = await Promise.all([
      resolveRewardCreationContext(venueId, definitionId),
      venueHasActivePos(venueId),
    ]);
    return NextResponse.json({ ok: true, context: { ...resolved, posConnected } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve reward context.";
    const status = message === REWARD_UNKNOWN_DEFINITION_MESSAGE ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
