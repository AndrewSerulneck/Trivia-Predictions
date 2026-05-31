import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listVenues } from "@/lib/venues";

// Default low-inventory threshold: ~6 days of buffer at the 1,080/month max usage.
const DEFAULT_LOW_THRESHOLD = 200;

type VenueInventory = {
  venueId: string;
  venueName: string;
  totalActive: number;
  seen: number;
  unseen: number;
  isLow: boolean;
};

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
    }
    const admin = supabaseAdmin;

    const url = new URL(request.url);
    const thresholdParam = Number(url.searchParams.get("threshold"));
    const threshold =
      Number.isFinite(thresholdParam) && thresholdParam >= 0 ? Math.floor(thresholdParam) : DEFAULT_LOW_THRESHOLD;

    // Active live-eligible pool is shared across venues — count once.
    const { count: totalActiveCount, error: totalError } = await admin
      .from("trivia_questions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .in("question_pool", ["live_showdown", "anytime_blitz"]);
    if (totalError) {
      throw new Error(totalError.message || "Failed to count active questions.");
    }
    const totalActive = Math.max(0, totalActiveCount ?? 0);

    const venues = await listVenues();

    const inventory: VenueInventory[] = await Promise.all(
      venues.map(async (venue) => {
        const { count: seenCount, error: seenError } = await admin
          .from("venue_seen_questions")
          .select("venue_id", { count: "exact", head: true })
          .eq("venue_id", venue.id);
        if (seenError) {
          throw new Error(seenError.message || "Failed to count seen questions.");
        }
        const seen = Math.max(0, seenCount ?? 0);
        const unseen = Math.max(0, totalActive - seen);
        return {
          venueId: venue.id,
          venueName: venue.displayName ?? venue.name,
          totalActive,
          seen,
          unseen,
          isLow: unseen < threshold,
        };
      })
    );

    return NextResponse.json({ ok: true, threshold, venues: inventory });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load venue question inventory." },
      { status: 500 }
    );
  }
}
