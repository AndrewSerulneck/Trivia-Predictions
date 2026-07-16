import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  getContinuousConfig,
  setContinuousConfig,
  getVenuePoolState,
  getAllAvailableCategories,
  validateCategoryPool,
} from "@/lib/categoryBlitzPool";
import type { CategoryBlitzModeSelection } from "@/types";

/** GET /api/category-blitz/continuous-config?venueId=... — get config and pool state */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venueId")?.trim() ?? "";

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    }

    const [config, poolState] = await Promise.all([
      getContinuousConfig(venueId),
      getVenuePoolState(venueId),
    ]);

    return NextResponse.json({
      ok: true,
      config,
      poolState,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load continuous config." },
      { status: 500 }
    );
  }
}

/** POST /api/category-blitz/continuous-config — create or update config (admin only) */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      venueId?: string;
      isActive?: boolean;
      roundDurationSeconds?: number;
      intermissionSeconds?: number;
      modeSelection?: CategoryBlitzModeSelection;
      categoryPool?: string[];
      minCategoriesPerLetter?: number;
    };

    const venueId = String(body.venueId ?? "").trim();

    if (!venueId) {
      return NextResponse.json({ ok: false, error: "venueId is required." }, { status: 400 });
    }

    // Validate category pool if provided
    if (body.categoryPool && body.categoryPool.length > 0) {
      const validation = validateCategoryPool(
        body.categoryPool,
        body.minCategoriesPerLetter ?? 12
      );
      if (!validation.valid) {
        return NextResponse.json(
          {
            ok: false,
            error: "Insufficient category coverage",
            gaps: validation.gaps,
          },
          { status: 400 }
        );
      }
    }

    await setContinuousConfig(venueId, {
      isActive: body.isActive ?? false,
      roundDurationSeconds: body.roundDurationSeconds,
      intermissionSeconds: body.intermissionSeconds,
      modeSelection: body.modeSelection,
      categoryPool: body.categoryPool,
      minCategoriesPerLetter: body.minCategoriesPerLetter,
    });

    // Return updated state
    const [config, poolState] = await Promise.all([
      getContinuousConfig(venueId),
      getVenuePoolState(venueId),
    ]);

    return NextResponse.json({
      ok: true,
      config,
      poolState,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update continuous config.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
