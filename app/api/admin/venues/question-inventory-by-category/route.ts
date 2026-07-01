import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listVenues } from "@/lib/venues";

const PAGE_SIZE = 1000;
const VENUE_ID_BATCH_SIZE = 50;

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

type VenueSeenQuestionRow = {
  venue_id: string | null;
  question_id: string | null;
};

type InventorySummaryRow = {
  venue_id: string | null;
  category: string | null;
  total_active: number | null;
  seen_active: number | null;
  unseen_active: number | null;
};

async function fetchAllActiveLiveTriviaQuestions(admin: NonNullable<typeof supabaseAdmin>) {
  const rows: Array<{ slug: string | null; category: string | null }> = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("trivia_questions")
      .select("slug, category")
      .eq("status", "active")
      .eq("question_pool", "live_showdown")
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message || "Failed to fetch active questions.");
    }

    const batch = (data ?? []) as Array<{ slug: string | null; category: string | null }>;
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchSeenQuestionSlugsByVenue(
  admin: NonNullable<typeof supabaseAdmin>,
  venueIds: readonly string[]
) {
  const byVenue = new Map<string, string[]>();
  for (const venueId of venueIds) byVenue.set(venueId, []);
  if (venueIds.length === 0) return byVenue;

  for (let batchStart = 0; batchStart < venueIds.length; batchStart += VENUE_ID_BATCH_SIZE) {
    const batchVenueIds = venueIds.slice(batchStart, batchStart + VENUE_ID_BATCH_SIZE);

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("venue_seen_questions")
        .select("venue_id, question_id")
        .in("venue_id", batchVenueIds)
        .order("venue_id", { ascending: true })
        .order("question_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new Error(error.message || "Failed to fetch seen questions for venues.");
      }

      const rows = (data ?? []) as VenueSeenQuestionRow[];
      for (const row of rows) {
        const venueId = String(row.venue_id ?? "").trim();
        const questionId = String(row.question_id ?? "").trim();
        if (!venueId || !questionId || !byVenue.has(venueId)) continue;
        byVenue.get(venueId)!.push(questionId);
      }

      if (rows.length < PAGE_SIZE) break;
    }
  }

  return byVenue;
}

async function fetchInventorySummaryByVenue(
  admin: NonNullable<typeof supabaseAdmin>,
  venueIds: readonly string[]
) {
  const byVenue = new Map<string, InventorySummaryRow[]>();
  for (const venueId of venueIds) byVenue.set(venueId, []);
  if (venueIds.length === 0) return byVenue;

  for (let batchStart = 0; batchStart < venueIds.length; batchStart += VENUE_ID_BATCH_SIZE) {
    const batchVenueIds = venueIds.slice(batchStart, batchStart + VENUE_ID_BATCH_SIZE);

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("venue_live_trivia_inventory_summary")
        .select("venue_id, category, total_active, seen_active, unseen_active")
        .in("venue_id", batchVenueIds)
        .order("venue_id", { ascending: true })
        .order("category", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw new Error(error.message || "Failed to fetch Live Trivia inventory summary.");
      }

      const rows = (data ?? []) as InventorySummaryRow[];
      for (const row of rows) {
        const venueId = String(row.venue_id ?? "").trim();
        if (!venueId || !byVenue.has(venueId)) continue;
        byVenue.get(venueId)!.push(row);
      }

      if (rows.length < PAGE_SIZE) break;
    }
  }

  return byVenue;
}

async function buildVenueInventoriesFromRawSeenQuestions(
  admin: NonNullable<typeof supabaseAdmin>,
  venues: Awaited<ReturnType<typeof listVenues>>
): Promise<Array<Omit<VenueCategoryInventory, "warnings" | "resets">>> {
  // Fallback path for deploy timing or summary rebuild issues. This is slower
  // than the summary table, but keeps the admin page trustworthy.
  const activeQuestions = await fetchAllActiveLiveTriviaQuestions(admin);

  const categorySlugMap = new Map<string, Set<string>>();
  for (const q of activeQuestions) {
    const cat = q.category ?? "Uncategorized";
    if (!categorySlugMap.has(cat)) categorySlugMap.set(cat, new Set());
    if (q.slug) categorySlugMap.get(cat)!.add(q.slug);
  }
  const allSlugs = new Set(activeQuestions.map((q) => q.slug).filter((slug): slug is string => Boolean(slug)));
  const totalActive = allSlugs.size;
  const seenSlugsByVenue = await fetchSeenQuestionSlugsByVenue(
    admin,
    venues.map((venue) => venue.id)
  );

  return venues.map((venue) => {
    const seenSlugs = seenSlugsByVenue.get(venue.id) ?? [];
    const seenActiveSet = new Set<string>(seenSlugs.filter((slug) => allSlugs.has(slug)));
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

    return {
      venueId: venue.id,
      venueName: venue.displayName ?? venue.name,
      totalActive,
      totalSeen: seenActiveSet.size,
      totalUnseen: totalActive - seenActiveSet.size,
      categories,
    };
  });
}

async function buildVenueInventoriesFromSummary(
  admin: NonNullable<typeof supabaseAdmin>,
  venues: Awaited<ReturnType<typeof listVenues>>
): Promise<Array<Omit<VenueCategoryInventory, "warnings" | "resets">>> {
  let summaryByVenue: Map<string, InventorySummaryRow[]>;
  try {
    summaryByVenue = await fetchInventorySummaryByVenue(
      admin,
      venues.map((venue) => venue.id)
    );
  } catch (error) {
    console.warn(
      "[live-trivia-inventory] Falling back to raw inventory scan:",
      error instanceof Error ? error.message : String(error)
    );
    return buildVenueInventoriesFromRawSeenQuestions(admin, venues);
  }

  const summaryRowCount = Array.from(summaryByVenue.values()).reduce((sum, rows) => sum + rows.length, 0);
  if (venues.length > 0 && summaryRowCount === 0) {
    return buildVenueInventoriesFromRawSeenQuestions(admin, venues);
  }

  return venues.map((venue) => {
    const rows = summaryByVenue.get(venue.id) ?? [];
    const categories: CategoryInventory[] = rows
      .map((row) => {
        const total = Math.max(0, Number(row.total_active ?? 0));
        const seen = Math.max(0, Number(row.seen_active ?? 0));
        const unseen = Math.max(0, Number(row.unseen_active ?? Math.max(0, total - seen)));
        return {
          category: String(row.category ?? "Uncategorized").trim() || "Uncategorized",
          total,
          seen,
          unseen,
          pctExhausted: total > 0 ? Math.round((seen / total) * 100) : 0,
        };
      })
      .filter((category) => category.total > 0)
      .sort((a, b) => b.pctExhausted - a.pctExhausted);

    const totalActive = categories.reduce((sum, category) => sum + category.total, 0);
    const totalSeen = categories.reduce((sum, category) => sum + category.seen, 0);
    const totalUnseen = categories.reduce((sum, category) => sum + category.unseen, 0);

    return {
      venueId: venue.id,
      venueName: venue.displayName ?? venue.name,
      totalActive,
      totalSeen,
      totalUnseen,
      categories,
    };
  });
}

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

    const venues = await listVenues();
    const baseInventories = await buildVenueInventoriesFromSummary(admin, venues);
    const baseInventoryByVenue = new Map(baseInventories.map((venue) => [venue.venueId, venue]));

    // Fetch the small recent warning/reset panels for each venue. The expensive
    // seen/unseen inventory counts come from the summary table above.
    const venueInventories: VenueCategoryInventory[] = await Promise.all(
      venues.map(async (venue) => {
        const baseInventory = baseInventoryByVenue.get(venue.id) ?? {
          venueId: venue.id,
          venueName: venue.displayName ?? venue.name,
          totalActive: 0,
          totalSeen: 0,
          totalUnseen: 0,
          categories: [],
        };

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
          ...baseInventory,
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
