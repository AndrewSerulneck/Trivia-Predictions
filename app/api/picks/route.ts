import { NextResponse } from "next/server";
import { listUserPredictions } from "@/lib/userPredictions";
import type { PredictionStatus } from "@/types";

type StatusFilter = PredictionStatus | "all";

function normalizeStatus(value: string): StatusFilter {
  if (value === "pending" || value === "won" || value === "lost" || value === "push" || value === "canceled") {
    return value;
  }
  return "all";
}

function normalizePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = (searchParams.get("userId") ?? "").trim();
  const status = normalizeStatus((searchParams.get("status") ?? "all").trim().toLowerCase());
  const pageSize = Math.max(1, Math.min(50, normalizePositiveInt(searchParams.get("pageSize"), 25)));
  const page = Math.max(1, normalizePositiveInt(searchParams.get("page"), 1));
  const offset = (page - 1) * pageSize;

  if (!userId) {
    return NextResponse.json({
      ok: true,
      items: [],
      page,
      pageSize,
      totalItems: 0,
      totalPages: 1,
      status,
    });
  }

  const { items, totalItems } = await listUserPredictions(userId, {
    status,
    limit: pageSize,
    offset,
  });
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return NextResponse.json({
    ok: true,
    items,
    page: Math.min(page, totalPages),
    pageSize,
    totalItems,
    totalPages,
    status,
  });
}
