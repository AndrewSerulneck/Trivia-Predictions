import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listVenues } from "@/lib/venues";

export type CategoryInventory = {
  category: string;
  total: number;
  seen: number;
  unseen: number;
  pctExhausted: number;
};

export type VenueCategoryInventory = {
  venueId: string;
  venueName: string;
  totalActive: number;
  totalSeen: number;
  totalUnseen: number;
  categories: CategoryInventory[];
  warnings: RecentWarning[];
  resets: RecentReset[];
};

type RecentReset = {
  category: string;
  categoryTotal: number;
  freedCount: number;
  carriedForwardCount: number;
  createdAt: string;
};

type RecentWarning = {
  occurrenceDate: string;
  usedSeen: boolean;
  repeatedQuestions: boolean;
  usedOverflow: boolean;
  seededCount: number;
  neededCount: number;
  createdAt: string;
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

    // 1. Fetch all active live_showdown questions with their category
    const { data: activeQuestions, error: questionsError } = await admin
      .from("trivia_questions")
      .select("slug, category")
      .eq("status", "active")
      .eq("question_pool", "live_showdown");
    if (questionsError) {
      throw new Error(questionsError.message || "Failed to fetch active questions.");
    }

    // Build category → set of slugs map
    const categorySlugMap = new Map<string, Set<string>>();
    for (const q of activeQuestions ?? []) {
      const cat = q.category ?? "Uncategorized";
      if (!categorySlugMap.has(cat)) categorySlugMap.set(cat, new Set());
      categorySlugMap.get(cat)!.add(q.slug);
    }
    const allSlugs = new Set((activeQuestions ?? []).map((q) => q.slug));
    const totalActive = allSlugs.size;

    const venues = await listVenues();

    // 2. For each venue, fetch seen question slugs + recent warnings
    const venueInventories: VenueCategoryInventory[] = await Promise.all(
      venues.map(async (venue) => {
        // Fetch seen question slugs for this venue
        const { data: seenRows, error: seenError } = await admin
          .from("venue_seen_questions")
          .select("question_id")
          .eq("venue_id", venue.id);
        if (seenError) {
          throw new Error(seenError.message || `Failed to fetch seen questions for venue ${venue.id}.`);
        }

        // Only count seen slugs that are still active (pool may have changed)
        const seenActiveSet = new Set<string>(
          (seenRows ?? []).map((r) => r.question_id).filter((s) => allSlugs.has(s))
        );

        // Per-category breakdown
        const categories: CategoryInventory[] = Array.from(categorySlugMap.entries())
          .map(([category, slugs]) => {
            const total = slugs.size;
            const seen = [...slugs].filter((s) => seenActiveSet.has(s)).length;
            const unseen = total - seen;
            return {
              category,
              total,
              seen,
              unseen,
              pctExhausted: total > 0 ? Math.round((seen / total) * 100) : 0,
            };
          })
          .sort((a, b) => b.pctExhausted - a.pctExhausted);

        // Fetch recent warnings (last 10)
        const { data: warningRows } = await admin
          .from("venue_question_warnings")
          .select("occurrence_date, used_seen, repeated_questions, used_overflow, seeded_count, needed_count, created_at")
          .eq("venue_id", venue.id)
          .order("created_at", { ascending: false })
          .limit(10);

        const warnings: RecentWarning[] = (warningRows ?? []).map((w) => ({
          occurrenceDate: w.occurrence_date,
          usedSeen: w.used_seen,
          repeatedQuestions: w.repeated_questions,
          usedOverflow: w.used_overflow ?? false,
          seededCount: w.seeded_count,
          neededCount: w.needed_count,
          createdAt: w.created_at,
        }));

        // Fetch recent per-category epoch resets (last 10)
        const { data: resetRows } = await admin
          .from("venue_category_resets")
          .select("category, category_total, freed_count, carried_forward_count, created_at")
          .eq("venue_id", venue.id)
          .order("created_at", { ascending: false })
          .limit(10);

        const resets: RecentReset[] = (resetRows ?? []).map((r) => ({
          category: r.category,
          categoryTotal: r.category_total,
          freedCount: r.freed_count,
          carriedForwardCount: r.carried_forward_count,
          createdAt: r.created_at,
        }));

        return {
          venueId: venue.id,
          venueName: venue.displayName ?? venue.name,
          totalActive,
          totalSeen: seenActiveSet.size,
          totalUnseen: totalActive - seenActiveSet.size,
          categories,
          warnings,
          resets,
        };
      })
    );

    return NextResponse.json({ ok: true, venues: venueInventories });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load category inventory." },
      { status: 500 }
    );
  }
}
