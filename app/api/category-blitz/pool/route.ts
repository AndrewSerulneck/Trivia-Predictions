import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  addCategoriesToPool,
  removeCategoriesFromPool,
  getVenuePoolState,
  getAllAvailableCategories,
} from "@/lib/categoryBlitzPool";
import { broadcastCategoryBlitz } from "@/lib/categoryBlitzBroadcast";

/** GET /api/category-blitz/pool?venueId=... — get pool state and available categories */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venueId")?.trim() ?? "";

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    }

    const [poolState, allCategories] = await Promise.all([
      getVenuePoolState(venueId),
      Promise.resolve(getAllAvailableCategories()),
    ]);

    return NextResponse.json({
      ok: true,
      poolState,
      allCategories,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load pool state." },
      { status: 500 }
    );
  }
}

/** POST /api/category-blitz/pool — add categories to pool (admin only) */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      venueId?: string;
      categories?: string[];
    };

    const venueId = String(body.venueId ?? "").trim();
    const categories = body.categories ?? [];

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    }

    if (!Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json(
        { ok: false, error: "categories must be a non-empty array." },
        { status: 400 }
      );
    }

    await addCategoriesToPool(venueId, categories);

    // Broadcast pool update to all connected clients
    await broadcastCategoryBlitz(venueId, "pool_updated", {
      action: "added",
      categories,
    });

    // Return updated state
    const poolState = await getVenuePoolState(venueId);

    return NextResponse.json({
      ok: true,
      poolState,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add categories.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** DELETE /api/category-blitz/pool — remove categories from pool (admin only) */
export async function DELETE(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      venueId?: string;
      categories?: string[];
    };

    const venueId = String(body.venueId ?? "").trim();
    const categories = body.categories ?? [];

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    }

    if (!Array.isArray(categories) || categories.length === 0) {
      return NextResponse.json(
        { ok: false, error: "categories must be a non-empty array." },
        { status: 400 }
      );
    }

    await removeCategoriesFromPool(venueId, categories);

    // Broadcast pool update to all connected clients
    await broadcastCategoryBlitz(venueId, "pool_updated", {
      action: "removed",
      categories,
    });

    // Return updated state
    const poolState = await getVenuePoolState(venueId);

    return NextResponse.json({
      ok: true,
      poolState,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove categories.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
