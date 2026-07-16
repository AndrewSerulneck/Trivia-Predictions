import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { validateCategoryPool } from "@/lib/categoryBlitzPool";

/** POST /api/category-blitz/pool/validate — validate category pool coverage */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as {
      categories?: string[];
      minCategoriesPerLetter?: number;
    };

    const categories = body.categories ?? [];
    const minCategoriesPerLetter = body.minCategoriesPerLetter ?? 12;

    if (!Array.isArray(categories)) {
      return NextResponse.json(
        { ok: false, error: "categories must be an array." },
        { status: 400 }
      );
    }

    const validation = validateCategoryPool(categories, minCategoriesPerLetter);

    return NextResponse.json({
      ok: true,
      valid: validation.valid,
      gaps: validation.gaps,
      coverage: validation.coverage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to validate pool.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** GET /api/category-blitz/pool/validate?minCategoriesPerLetter=... — validate current pool */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoriesParam = searchParams.get("categories");
    const minCategoriesPerLetter = parseInt(
      searchParams.get("minCategoriesPerLetter") ?? "12",
      10
    );

    let categories: string[] = [];
    if (categoriesParam) {
      try {
        categories = JSON.parse(categoriesParam);
        if (!Array.isArray(categories)) {
          return NextResponse.json(
            { ok: false, error: "categories must be an array." },
            { status: 400 }
          );
        }
      } catch {
        return NextResponse.json(
          { ok: false, error: "categories must be valid JSON array." },
          { status: 400 }
        );
      }
    }

    const validation = validateCategoryPool(categories, minCategoriesPerLetter);

    return NextResponse.json({
      ok: true,
      valid: validation.valid,
      gaps: validation.gaps,
      coverage: validation.coverage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to validate pool.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
