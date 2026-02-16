import { NextResponse } from "next/server";
import {
  createAdminAdvertisement,
  createAdminTriviaQuestion,
  deleteAdminAdvertisement,
  deleteAdminTriviaQuestion,
  getAdminAdsDebugSnapshot,
  listPendingPredictionSummaries,
  listAdminAdvertisements,
  listAdminTriviaQuestions,
  resolvePendingPredictionMarket,
  updateAdminAdvertisement,
  updateAdminTriviaQuestion,
} from "@/lib/admin";
import { requireAdminAuth } from "@/lib/adminAuth";
import { recordAdClick, recordAdImpression } from "@/lib/ads";
import type { AdSlot } from "@/types";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const resource = searchParams.get("resource");

    if (resource === "trivia") {
      const items = await listAdminTriviaQuestions();
      return NextResponse.json({ ok: true, items });
    }

    if (resource === "ads") {
      const items = await listAdminAdvertisements();
      return NextResponse.json({ ok: true, items });
    }

    if (resource === "ads-debug") {
      const rawWindow = Number.parseInt(searchParams.get("windowHours") ?? "24", 10);
      const windowHours = Number.isFinite(rawWindow) ? rawWindow : 24;
      const snapshot = await getAdminAdsDebugSnapshot(windowHours);
      return NextResponse.json({ ok: true, snapshot });
    }

    if (resource === "predictions-pending") {
      const items = await listPendingPredictionSummaries();
      return NextResponse.json({ ok: true, items });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unknown resource. Use resource=trivia, resource=ads, resource=ads-debug, or resource=predictions-pending.",
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load admin resource." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as
      | {
          resource: "trivia";
          question: string;
          options: string[];
          correctAnswer: number;
          category?: string;
          difficulty?: string;
        }
      | {
          resource: "ads";
          slot: AdSlot;
          venueId?: string;
          advertiserName: string;
          imageUrl: string;
          clickUrl: string;
          altText: string;
          width: number;
          height: number;
          active: boolean;
          startDate: string;
          endDate?: string;
        }
      | {
          resource: "ads-track";
          adId: string;
          eventType: "impression" | "click";
        }
      | {
          resource: "predictions-settle";
          predictionId: string;
          winningOutcomeId?: string;
          settleAsCanceled?: boolean;
        };

    if (body.resource === "trivia") {
      const item = await createAdminTriviaQuestion({
        question: body.question,
        options: body.options,
        correctAnswer: body.correctAnswer,
        category: body.category,
        difficulty: body.difficulty,
      });
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "ads") {
      const item = await createAdminAdvertisement({
        slot: body.slot,
        venueId: body.venueId,
        advertiserName: body.advertiserName,
        imageUrl: body.imageUrl,
        clickUrl: body.clickUrl,
        altText: body.altText,
        width: body.width,
        height: body.height,
        active: body.active,
        startDate: body.startDate,
        endDate: body.endDate,
      });
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "ads-track") {
      const adId = body.adId?.trim();
      if (!adId) {
        return NextResponse.json({ ok: false, error: "adId is required." }, { status: 400 });
      }

      if (body.eventType === "impression") {
        await recordAdImpression(adId);
      } else {
        await recordAdClick(adId);
      }

      return NextResponse.json({ ok: true });
    }

    if (body.resource === "predictions-settle") {
      const result = await resolvePendingPredictionMarket({
        predictionId: body.predictionId,
        winningOutcomeId: body.winningOutcomeId,
        settleAsCanceled: body.settleAsCanceled,
      });
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create admin resource." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const resource = searchParams.get("resource");
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
    }

    if (resource === "trivia") {
      await deleteAdminTriviaQuestion(id);
      return NextResponse.json({ ok: true });
    }

    if (resource === "ads") {
      await deleteAdminAdvertisement(id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown resource. Use resource=trivia or resource=ads." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete admin resource." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as
      | {
          resource: "trivia";
          id: string;
          question: string;
          options: string[];
          correctAnswer: number;
          category?: string;
          difficulty?: string;
        }
      | {
          resource: "ads";
          id: string;
          slot: AdSlot;
          venueId?: string;
          advertiserName: string;
          imageUrl: string;
          clickUrl: string;
          altText: string;
          width: number;
          height: number;
          active: boolean;
          startDate: string;
          endDate?: string;
        };

    if (body.resource === "trivia") {
      const item = await updateAdminTriviaQuestion({
        id: body.id,
        question: body.question,
        options: body.options,
        correctAnswer: body.correctAnswer,
        category: body.category,
        difficulty: body.difficulty,
      });
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "ads") {
      const item = await updateAdminAdvertisement({
        id: body.id,
        slot: body.slot,
        venueId: body.venueId,
        advertiserName: body.advertiserName,
        imageUrl: body.imageUrl,
        clickUrl: body.clickUrl,
        altText: body.altText,
        width: body.width,
        height: body.height,
        active: body.active,
        startDate: body.startDate,
        endDate: body.endDate,
      });
      return NextResponse.json({ ok: true, item });
    }

    return NextResponse.json({ ok: false, error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update admin resource." },
      { status: 500 }
    );
  }
}
