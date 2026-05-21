import { NextResponse } from "next/server";
import {
  createAdminAdvertisement,
  createAdminVenue,
  autoSettleResolvedPredictionMarkets,
  createAdminTriviaQuestion,
  deleteAdminAdvertisement,
  deleteAdminTriviaQuestion,
  getAdminAdsDebugSnapshot,
  bulkUpdateAdminTriviaQuestions,
  listPendingPredictionSummaries,
  listAdminAdvertisements,
  listAdminTriviaQuestions,
  resolvePendingPredictionMarket,
  updateAdminVenue,
  updateAdminAdvertisement,
  updateAdminTriviaQuestion,
  updateAdPlacements,
} from "@/lib/admin";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  createChallengeCampaign,
  deleteChallengeCampaign,
  listChallengeCampaignProgress,
  listChallengeCampaigns,
  updateChallengeCampaign,
} from "@/lib/challengeCampaigns";
import { recordAdClick, recordAdImpression } from "@/lib/ads";
import type { AdDisplayTrigger, AdPageKey, AdSlot, AdType, CampaignRecurringType, ChallengeImageFitMode } from "@/types";
import {
  createAdminLiveShowdownSchedule,
  deleteAdminLiveShowdownSchedule,
  forceAdvanceLiveShowdownToNextQuestion,
  listAdminLiveShowdownSchedules,
  resetLiveShowdownAnswersForSchedule,
} from "@/lib/liveShowdownAdmin";

export async function GET(request: Request) {
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const resource = searchParams.get("resource");

    if (resource === "trivia") {
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10)));
      const questionPool = String(searchParams.get("questionPool") ?? "").trim() || undefined;
      const answerFormat = String(searchParams.get("answerFormat") ?? "").trim() || undefined;
      const result = await listAdminTriviaQuestions({ page, pageSize, questionPool, answerFormat });
      return NextResponse.json({ ok: true, ...result });
    }

    if (resource === "ads") {
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "100", 10)));
      const result = await listAdminAdvertisements({ page, pageSize });
      return NextResponse.json({ ok: true, ...result });
    }

    if (resource === "ads-debug") {
      const rawWindow = Number.parseInt(searchParams.get("windowHours") ?? "24", 10);
      const windowHours = Number.isFinite(rawWindow) ? rawWindow : 24;
      const startDate = String(searchParams.get("startDate") ?? "").trim() || undefined;
      const endDate = String(searchParams.get("endDate") ?? "").trim() || undefined;
      const snapshot = await getAdminAdsDebugSnapshot({ startDate, endDate, windowHours });
      return NextResponse.json({ ok: true, snapshot });
    }

    if (resource === "predictions-pending") {
      const items = await listPendingPredictionSummaries();
      return NextResponse.json({ ok: true, items });
    }

    if (resource === "challenge-campaigns") {
      const venueId = String(searchParams.get("venueId") ?? "").trim() || undefined;
      const includeInactive = String(searchParams.get("includeInactive") ?? "true").trim().toLowerCase() !== "false";
      const includeResolved = String(searchParams.get("includeResolved") ?? "true").trim().toLowerCase() !== "false";
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "100", 10)));
      const allItems = await listChallengeCampaigns({ venueId, includeInactive, includeResolved });
      const total = allItems.length;
      const from = (page - 1) * pageSize;
      const items = allItems.slice(from, from + pageSize);
      return NextResponse.json({ ok: true, items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
    }

    if (resource === "challenge-campaign-progress") {
      const challengeId = String(searchParams.get("challengeId") ?? "").trim() || undefined;
      const venueId = String(searchParams.get("venueId") ?? "").trim() || undefined;
      const userId = String(searchParams.get("userId") ?? "").trim() || undefined;
      const items = await listChallengeCampaignProgress({ challengeId, venueId, userId });
      return NextResponse.json({ ok: true, items });
    }

    if (resource === "session") {
      return NextResponse.json({ ok: true, isAdmin: true, scope: "join" });
    }

    if (resource === "live-showdown-schedules") {
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10)));
      const allItems = await listAdminLiveShowdownSchedules(500);
      const total = allItems.length;
      const from = (page - 1) * pageSize;
      const items = allItems.slice(from, from + pageSize);
      return NextResponse.json({ ok: true, items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unknown resource. Use resource=trivia, resource=ads, resource=ads-debug, resource=predictions-pending, resource=challenge-campaigns, or resource=live-showdown-schedules.",
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
          options?: string[];
          correctAnswer?: number;
          category?: string;
          difficulty?: string;
          questionPool?: "anytime_blitz" | "live_showdown";
          answerFormat?: "multiple_choice" | "write_in" | "numeric" | "true_false";
        }
      | {
          resource: "ads";
          slot: AdSlot;
          isPlaceholder?: boolean;
          pageKey?: AdPageKey;
          adType?: AdType;
          displayTrigger?: AdDisplayTrigger;
          placementKey?: string;
          roundNumber?: number;
          sequenceIndex?: number;
          venueId?: string;
          venueIds?: string[];
          targetAllVenues?: boolean;
          targetCities?: string[];
          targetZipCodes?: string[];
          targetCounties?: string[];
          targetStates?: string[];
          targetRegions?: string[];
          advertiserName: string;
          frequencyInterval?: number;
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
        }
      | {
          resource: "challenge-campaigns";
          name: string;
          imageUrl?: string;
          imageScale?: number;
          imageFocusX?: number;
          imageFocusY?: number;
          imageFit?: ChallengeImageFitMode;
          rules: string;
          venueIds?: string[];
          activeDays?: string[];
          startTime?: string;
          endTime?: string;
          endDate?: string;
          gameTypes?: string[];
          pointMultiplier?: number;
          pointsRequiredToWin?: number;
          recurringType?: CampaignRecurringType;
          isActive?: boolean;
        }
      | {
          resource: "live-showdown-schedules";
          title: string;
          targetDate: string;
          startTime: string;
          timezone: string;
          numRounds: number;
          venueId: string;
          intermissionAdDelaySeconds?: number;
          lobbyAdEnabled?: boolean;
        }
      | {
          resource: "live-showdown-force-next-phase";
          scheduleId: string;
        }
      | {
          resource: "live-showdown-reset-answers";
          scheduleId: string;
        };

    if (body.resource === "trivia") {
      const item = await createAdminTriviaQuestion({
        question: body.question,
        options: body.options,
        correctAnswer: body.correctAnswer,
        category: body.category,
        difficulty: body.difficulty,
        questionPool: body.questionPool,
        answerFormat: body.answerFormat,
      });
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "ads") {
      const item = await createAdminAdvertisement({
        slot: body.slot,
        isPlaceholder: body.isPlaceholder,
        pageKey: body.pageKey,
        adType: body.adType,
        displayTrigger: body.displayTrigger,
        placementKey: body.placementKey,
        roundNumber: body.roundNumber,
        sequenceIndex: body.sequenceIndex,
        venueId: body.venueId,
        venueIds: body.venueIds,
        targetAllVenues: body.targetAllVenues,
        targetCities: body.targetCities,
        targetZipCodes: body.targetZipCodes,
        targetCounties: body.targetCounties,
        targetStates: body.targetStates,
        targetRegions: body.targetRegions,
        advertiserName: body.advertiserName,
        frequencyInterval: body.frequencyInterval,
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

    if (body.resource === "challenge-campaigns") {
      const item = await createChallengeCampaign({
        name: body.name,
        imageUrl: body.imageUrl,
        imageScale: body.imageScale,
        imageFocusX: body.imageFocusX,
        imageFocusY: body.imageFocusY,
        imageFit: body.imageFit,
        rules: body.rules,
        venueIds: body.venueIds,
        activeDays: body.activeDays,
        startTime: body.startTime,
        endTime: body.endTime,
        endDate: body.endDate,
        gameTypes: body.gameTypes,
        pointMultiplier: body.pointMultiplier,
        pointsRequiredToWin: body.pointsRequiredToWin,
        recurringType: body.recurringType,
        isActive: body.isActive,
      });
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "live-showdown-schedules") {
      const item = await createAdminLiveShowdownSchedule({
        title: body.title,
        targetDate: body.targetDate,
        startTime: body.startTime,
          timezone: body.timezone,
          numRounds: body.numRounds,
          venueId: body.venueId,
          intermissionAdDelaySeconds: body.intermissionAdDelaySeconds,
          lobbyAdEnabled: body.lobbyAdEnabled,
        });
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "live-showdown-force-next-phase") {
      const allowDevControls =
        process.env.NODE_ENV !== "production" || String(process.env.ENABLE_LIVE_SHOWDOWN_DEV_CONTROLS ?? "").trim() === "true";
      if (!allowDevControls) {
        return NextResponse.json({ ok: false, error: "Live Trivia developer controls are disabled in production." }, { status: 403 });
      }
      const result = await forceAdvanceLiveShowdownToNextQuestion(body.scheduleId);
      return NextResponse.json({ ok: true, result });
    }

    if (body.resource === "live-showdown-reset-answers") {
      const allowDevControls =
        process.env.NODE_ENV !== "production" || String(process.env.ENABLE_LIVE_SHOWDOWN_DEV_CONTROLS ?? "").trim() === "true";
      if (!allowDevControls) {
        return NextResponse.json({ ok: false, error: "Live Trivia developer controls are disabled in production." }, { status: 403 });
      }
      const result = await resetLiveShowdownAnswersForSchedule(body.scheduleId);
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unknown resource. Use trivia, ads, venues, ads-track, predictions-settle, predictions-auto-settle, challenge-campaigns, or live-showdown-schedules.",
      },
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

    if (resource === "challenge-campaigns") {
      await deleteChallengeCampaign(id);
      return NextResponse.json({ ok: true });
    }

    if (resource === "live-showdown-schedules") {
      const result = await deleteAdminLiveShowdownSchedule(id);
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json(
      {
        ok: false,
        error: "Unknown resource. Use resource=trivia, resource=ads, resource=challenge-campaigns, or resource=live-showdown-schedules.",
      },
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
          options?: string[];
          correctAnswer?: number;
          category?: string;
          difficulty?: string;
          questionPool?: "anytime_blitz" | "live_showdown";
          answerFormat?: "multiple_choice" | "write_in" | "numeric" | "true_false";
        }
      | {
          resource: "ads";
          id: string;
          slot: AdSlot;
          isPlaceholder?: boolean;
          pageKey?: AdPageKey;
          adType?: AdType;
          displayTrigger?: AdDisplayTrigger;
          placementKey?: string;
          roundNumber?: number;
          sequenceIndex?: number;
          venueId?: string;
          venueIds?: string[];
          targetAllVenues?: boolean;
          targetCities?: string[];
          targetZipCodes?: string[];
          targetCounties?: string[];
          targetStates?: string[];
          targetRegions?: string[];
          advertiserName: string;
          frequencyInterval?: number;
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
        }
      | {
          resource: "challenge-campaigns";
          id: string;
          name?: string;
          imageUrl?: string;
          imageScale?: number;
          imageFocusX?: number;
          imageFocusY?: number;
          imageFit?: ChallengeImageFitMode;
          rules?: string;
          venueIds?: string[];
          activeDays?: string[];
          startTime?: string;
          endTime?: string;
          endDate?: string;
          gameTypes?: string[];
          pointMultiplier?: number;
          pointsRequiredToWin?: number;
          recurringType?: CampaignRecurringType;
          winnerUserId?: string | null;
          isActive?: boolean;
        }
      | {
          resource: "ads-placement";
          updates: Array<{ id: string; slotKey: string; priority: number }>;
        }
      | {
          resource: "trivia-bulk";
          ids: string[];
          questionPool?: "anytime_blitz" | "live_showdown";
          answerFormat?: "multiple_choice" | "write_in" | "numeric" | "true_false";
        };

    if (body.resource === "trivia") {
      const item = await updateAdminTriviaQuestion({
        id: body.id,
        question: body.question,
        options: body.options,
        correctAnswer: body.correctAnswer,
        category: body.category,
        difficulty: body.difficulty,
        questionPool: body.questionPool,
        answerFormat: body.answerFormat,
      });
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "ads") {
      const item = await updateAdminAdvertisement({
        id: body.id,
        slot: body.slot,
        isPlaceholder: body.isPlaceholder,
        pageKey: body.pageKey,
        adType: body.adType,
        displayTrigger: body.displayTrigger,
        placementKey: body.placementKey,
        roundNumber: body.roundNumber,
        sequenceIndex: body.sequenceIndex,
        venueId: body.venueId,
        venueIds: body.venueIds,
        targetAllVenues: body.targetAllVenues,
        targetCities: body.targetCities,
        targetZipCodes: body.targetZipCodes,
        targetCounties: body.targetCounties,
        targetStates: body.targetStates,
        targetRegions: body.targetRegions,
        advertiserName: body.advertiserName,
        frequencyInterval: body.frequencyInterval,
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

    if (body.resource === "challenge-campaigns") {
      const item = await updateChallengeCampaign({
        id: body.id,
        name: body.name,
        imageUrl: body.imageUrl,
        imageScale: body.imageScale,
        imageFocusX: body.imageFocusX,
        imageFocusY: body.imageFocusY,
        imageFit: body.imageFit,
        rules: body.rules,
        venueIds: body.venueIds,
        activeDays: body.activeDays,
        startTime: body.startTime,
        endTime: body.endTime,
        endDate: body.endDate,
        gameTypes: body.gameTypes,
        pointMultiplier: body.pointMultiplier,
        pointsRequiredToWin: body.pointsRequiredToWin,
        recurringType: body.recurringType,
        winnerUserId: body.winnerUserId,
        isActive: body.isActive,
      });
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "ads-placement") {
      const updates = (body.updates ?? []) as Array<{ id: string; slotKey: string; priority: number }>;
      if (!Array.isArray(updates) || updates.some((u) => !u.id || typeof u.slotKey !== "string" || !Number.isFinite(u.priority))) {
        return NextResponse.json({ ok: false, error: "Invalid updates array." }, { status: 400 });
      }
      await updateAdPlacements(updates);
      return NextResponse.json({ ok: true });
    }

    if (body.resource === "trivia-bulk") {
      await bulkUpdateAdminTriviaQuestions({
        ids: Array.isArray(body.ids) ? body.ids : [],
        questionPool: body.questionPool,
        answerFormat: body.answerFormat,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Unknown resource." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update admin resource." },
      { status: 500 }
    );
  }
}
