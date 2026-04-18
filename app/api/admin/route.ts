import { NextResponse } from "next/server";
import {
  createAdminAdvertisement,
  createAdminVenue,
  autoSettleResolvedPredictionMarkets,
  createAdminTriviaQuestion,
  deleteAdminAdvertisement,
  deleteAdminTriviaQuestion,
  getAdminAdsDebugSnapshot,
  listPendingPredictionSummaries,
  listAdminAdvertisements,
  listAdminTriviaQuestions,
  resolvePendingPredictionMarket,
  updateAdminVenue,
  updateAdminAdvertisement,
  updateAdminTriviaQuestion,
} from "@/lib/admin";
import { requireAdminAuth } from "@/lib/adminAuth";
import { recordAdClick, recordAdImpression } from "@/lib/ads";
import type { AdDisplayTrigger, AdPageKey, AdSlot, AdType } from "@/types";

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

    if (resource === "session") {
      return NextResponse.json({ ok: true, isAdmin: true, scope: "join" });
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
          pageKey?: AdPageKey;
          adType?: AdType;
          displayTrigger?: AdDisplayTrigger;
          placementKey?: string;
          roundNumber?: number;
          sequenceIndex?: number;
          venueId?: string;
          venueIds?: string[];
          advertiserName: string;
          deliveryWeight?: number;
          imageUrl: string;
          clickUrl: string;
          altText: string;
          width: number;
          height: number;
          dismissDelaySeconds?: number;
          popupCooldownSeconds?: number;
          active: boolean;
          startDate: string;
          endDate?: string;
        }
      | {
          resource: "venues";
          name: string;
          address: string;
          radius?: number;
          latitude?: number;
          longitude?: number;
          displayName?: string;
          logoText?: string;
          iconEmoji?: string;
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
        }
      | {
          resource: "predictions-auto-settle";
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
        pageKey: body.pageKey,
        adType: body.adType,
        displayTrigger: body.displayTrigger,
        placementKey: body.placementKey,
        roundNumber: body.roundNumber,
        sequenceIndex: body.sequenceIndex,
        venueId: body.venueId,
        venueIds: body.venueIds,
        advertiserName: body.advertiserName,
        deliveryWeight: body.deliveryWeight,
        imageUrl: body.imageUrl,
        clickUrl: body.clickUrl,
        altText: body.altText,
        width: body.width,
        height: body.height,
        dismissDelaySeconds: body.dismissDelaySeconds,
        popupCooldownSeconds: body.popupCooldownSeconds,
        active: body.active,
        startDate: body.startDate,
        endDate: body.endDate,
      });
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "venues") {
      const item = await createAdminVenue({
        name: body.name,
        address: body.address,
        radius: body.radius,
        latitude: body.latitude,
        longitude: body.longitude,
        displayName: body.displayName,
        logoText: body.logoText,
        iconEmoji: body.iconEmoji,
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

    if (body.resource === "predictions-auto-settle") {
      const result = await autoSettleResolvedPredictionMarkets();
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown resource. Use trivia, ads, venues, ads-track, predictions-settle, or predictions-auto-settle." },
      { status: 400 }
    );
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
          pageKey?: AdPageKey;
          adType?: AdType;
          displayTrigger?: AdDisplayTrigger;
          placementKey?: string;
          roundNumber?: number;
          sequenceIndex?: number;
          venueId?: string;
          venueIds?: string[];
          advertiserName: string;
          deliveryWeight?: number;
          imageUrl: string;
          clickUrl: string;
          altText: string;
          width: number;
          height: number;
          dismissDelaySeconds?: number;
          popupCooldownSeconds?: number;
          active: boolean;
          startDate: string;
          endDate?: string;
        }
      | {
          resource: "venues";
          id: string;
          name: string;
          displayName?: string;
          logoText?: string;
          iconEmoji?: string;
          address: string;
          radius: number;
          latitude?: number;
          longitude?: number;
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
        pageKey: body.pageKey,
        adType: body.adType,
        displayTrigger: body.displayTrigger,
        placementKey: body.placementKey,
        roundNumber: body.roundNumber,
        sequenceIndex: body.sequenceIndex,
        venueId: body.venueId,
        venueIds: body.venueIds,
        advertiserName: body.advertiserName,
        deliveryWeight: body.deliveryWeight,
        imageUrl: body.imageUrl,
        clickUrl: body.clickUrl,
        altText: body.altText,
        width: body.width,
        height: body.height,
        dismissDelaySeconds: body.dismissDelaySeconds,
        popupCooldownSeconds: body.popupCooldownSeconds,
        active: body.active,
        startDate: body.startDate,
        endDate: body.endDate,
      });
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "venues") {
      const item = await updateAdminVenue({
        id: body.id,
        name: body.name,
        displayName: body.displayName,
        logoText: body.logoText,
        iconEmoji: body.iconEmoji,
        address: body.address,
        radius: body.radius,
        latitude: body.latitude,
        longitude: body.longitude,
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
