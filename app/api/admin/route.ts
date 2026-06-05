import { NextResponse } from "next/server";
import {
  applyPlaceholderAdToAllInlineSlots,
  bulkDeleteAdminAdvertisements,
  bulkSetAdminAdvertisementsActive,
  createAdminAdvertisement,
  deleteAdminAccount,
  deleteAdminVenue,
  createAdminVenue,
  autoSettleResolvedPredictionMarkets,
  createAdminTriviaQuestion,
  deleteAdminAdvertisement,
  deleteAdminTriviaQuestion,
  deleteAdminLiveTriviaQuestionInFile,
  deleteAdminSpeedTriviaQuestionInFile,
  getAdminAdsDebugSnapshot,
  getAdminAdvertisementById,
  getAdminGeographicHierarchy,
  bulkUpdateAdminTriviaQuestions,
  listAdminAccounts,
  listPendingPredictionSummaries,
  listAdminAdvertisements,
  listAdminPickEmMatchupsByDate,
  listAdminPickEmUnsettledGames,
  listAdminTriviaQuestions,
  listAllLiveTriviaCategories,
  listAllSpeedTriviaCategories,
  listAdminLiveTriviaQuestionsFromFiles,
  listAdminSpeedTriviaQuestionsFromFiles,
  resolvePendingPredictionMarket,
  setAccountGodMode,
  settleAdminPickEmGame,
  updateAdminVenue,
  updateAdminAdvertisement,
  updateAdminTriviaQuestion,
  updateAdminLiveTriviaQuestionInFile,
  updateAdminSpeedTriviaQuestionInFile,
  updateAdPlacements,
} from "@/lib/admin";
import type { PlaceholderAdTemplateInput } from "@/lib/admin";
import { requireAdminAuth } from "@/lib/adminAuth";
import {
  createChallengeCampaign,
  deleteChallengeCampaign,
  listChallengeCampaignProgress,
  listChallengeCampaigns,
  updateChallengeCampaign,
} from "@/lib/challengeCampaigns";
import { recordAdClick, recordAdImpression } from "@/lib/ads";
import type {
  AdDisplayTrigger,
  AdPageKey,
  AdSlot,
  AdType,
  CampaignRecurringType,
  ChallengeScheduleType,
  ChallengeImageFitMode,
  ChallengeLeaderboardTiebreaker,
  ChallengeMode,
} from "@/types";
import {
  createAdminLiveShowdownSchedule,
  deleteAdminLiveShowdownSchedule,
  forceAdvanceLiveShowdownToNextQuestion,
  getAdminLiveShowdownSessionQuestions,
  getLiveShowdownRoundCategories,
  listAdminLiveShowdownSchedules,
  replaceRoundQuestionsWithCategory,
  replaceSingleSessionQuestion,
  swapSessionQuestion,
  resetLiveShowdownAnswersForSchedule,
  updateAdminLiveShowdownSchedule,
  updateAdminLiveShowdownSessionQuestions,
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
      const pageSize = Math.min(10000, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10)));
      const questionTypeRaw = String(searchParams.get("questionType") ?? "").trim().toLowerCase();
      const category = String(searchParams.get("category") ?? "").trim() || undefined;
      const answerFormatFilter = String(searchParams.get("answerFormat") ?? "").trim() || undefined;
      const sortByRaw = String(searchParams.get("sortBy") ?? "").trim();
      const sortDirectionRaw = String(searchParams.get("sortDirection") ?? "").trim().toLowerCase();
      const sortBy =
        sortByRaw === "category" || sortByRaw === "difficulty" || sortByRaw === "question_pool" || sortByRaw === "answer_format" || sortByRaw === "created_at"
          ? sortByRaw
          : undefined;
      const sortDirection = sortDirectionRaw === "asc" || sortDirectionRaw === "desc" ? sortDirectionRaw : undefined;

      // File-based question banks for live and speed trivia
      if (questionTypeRaw === "live") {
        const result = await listAdminLiveTriviaQuestionsFromFiles({
          page,
          pageSize,
          category,
          sortBy,
          sortDirection,
          answerFormat: answerFormatFilter,
        });
        return NextResponse.json({ ok: true, ...result });
      }
      if (questionTypeRaw === "speed") {
        const result = await listAdminSpeedTriviaQuestionsFromFiles({
          page,
          pageSize,
          category,
          sortBy,
          sortDirection,
          answerFormat: answerFormatFilter,
        });
        return NextResponse.json({ ok: true, ...result });
      }

      // Supabase fallback (no questionType param)
      const rawPool = String(searchParams.get("questionPool") ?? "").trim();
      const questionPool = rawPool || undefined;
      const answerFormat = String(searchParams.get("answerFormat") ?? "").trim() || undefined;
      const startDate = String(searchParams.get("startDate") ?? "").trim() || undefined;
      const endDate = String(searchParams.get("endDate") ?? "").trim() || undefined;
      const result = await listAdminTriviaQuestions({
        page,
        pageSize,
        questionPool,
        answerFormat,
        category,
        startDate,
        endDate,
        sortBy,
        sortDirection,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (resource === "apply-placeholder-inline") {
      return NextResponse.json(
        { ok: false, error: "Method not allowed. Use POST for apply-placeholder-inline." },
        { status: 405 }
      );
    }

    if (resource === "trivia-categories") {
      const questionTypeRaw = String(searchParams.get("questionType") ?? "").trim().toLowerCase();
      if (questionTypeRaw === "live") {
        const categories = await listAllLiveTriviaCategories();
        return NextResponse.json({ ok: true, categories });
      }
      if (questionTypeRaw === "speed") {
        const categories = await listAllSpeedTriviaCategories();
        return NextResponse.json({ ok: true, categories });
      }
      return NextResponse.json({ ok: false, error: "questionType is required (live or speed)" }, { status: 400 });
    }

    if (resource === "ads") {
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10)));
      const search = String(searchParams.get("search") ?? "").trim() || undefined;
      const parseCsv = (value: string | null) =>
        String(value ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      const venueIds = parseCsv(searchParams.get("venueIds"));
      const cities = parseCsv(searchParams.get("cities"));
      const zipCodes = parseCsv(searchParams.get("zipCodes"));
      const states = parseCsv(searchParams.get("states"));
      const regions = parseCsv(searchParams.get("regions"));
      const pageKeyRaw = String(searchParams.get("pageKey") ?? "").trim();
      const adTypeRaw = String(searchParams.get("adType") ?? "").trim();
      const activeRaw = String(searchParams.get("active") ?? "").trim().toLowerCase();
      const pageKey =
        pageKeyRaw === "join" ||
        pageKeyRaw === "venue" ||
        pageKeyRaw === "trivia" ||
        pageKeyRaw === "sports-bingo" ||
        pageKeyRaw === "pickem" ||
        pageKeyRaw === "fantasy" ||
        pageKeyRaw === "global" ||
        pageKeyRaw === "all"
          ? (pageKeyRaw as any)
          : undefined;
      const adType =
        adTypeRaw === "popup" || adTypeRaw === "banner" || adTypeRaw === "inline" || adTypeRaw === "all"
          ? (adTypeRaw as any)
          : undefined;
      const active =
        activeRaw === "active" || activeRaw === "inactive" || activeRaw === "all"
          ? (activeRaw as "active" | "inactive" | "all")
          : undefined;
      const result = await listAdminAdvertisements({
        page,
        pageSize,
        search,
        pageKey,
        adType,
        active,
        venueIds,
        cities,
        zipCodes,
        states,
        regions,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (resource === "ads-geography") {
      const hierarchy = await getAdminGeographicHierarchy();
      return NextResponse.json({ ok: true, hierarchy });
    }

    if (resource === "pickem-unsettled") {
      const items = await listAdminPickEmUnsettledGames();
      return NextResponse.json({ ok: true, items });
    }

    if (resource === "pickem-matchups") {
      const date = String(searchParams.get("date") ?? "").trim();
      const tzOffsetMinutes = String(searchParams.get("tzOffsetMinutes") ?? "").trim();
      if (!date) {
        return NextResponse.json({ ok: false, error: "date is required (YYYY-MM-DD)." }, { status: 400 });
      }
      const items = await listAdminPickEmMatchupsByDate({ date, tzOffsetMinutes });
      return NextResponse.json({ ok: true, items, date });
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

    if (resource === "accounts") {
      const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "25", 10)));
      const search = String(searchParams.get("search") ?? "").trim();
      const result = await listAdminAccounts({ page, pageSize, search });
      return NextResponse.json({ ok: true, ...result, page, pageSize, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) });
    }

    if (resource === "live-showdown-session-questions") {
      const scheduleId = String(searchParams.get("scheduleId") ?? "").trim();
      if (!scheduleId) {
        return NextResponse.json({ ok: false, error: "scheduleId is required." }, { status: 400 });
      }
      const items = await getAdminLiveShowdownSessionQuestions(scheduleId);
      return NextResponse.json({ ok: true, items });
    }

    if (resource === "live-showdown-categories") {
      const categories = await getLiveShowdownRoundCategories();
      return NextResponse.json({ ok: true, categories });
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
          "Unknown resource. Use resource=trivia, resource=ads, resource=ads-geography, resource=ads-debug, resource=pickem-unsettled, resource=pickem-matchups, resource=predictions-pending, resource=challenge-campaigns, or resource=live-showdown-schedules.",
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

    const { searchParams } = new URL(request.url);
    const resourceFromQuery = String(searchParams.get("resource") ?? "").trim();

    const body = (await request.json()) as
      | {
          resource: "trivia";
          question: string;
          options?: string[];
          acceptableAnswers?: string[];
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
          venueIds?: string[];
          targetAllVenues?: boolean;
          cities?: string[];
          zipCodes?: string[];
          counties?: string[];
          states?: string[];
          regions?: string[];
          /** Backward-compat aliases while older clients migrate. */
          venueId?: string;
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
          street?: string;
          address?: string;
          radius?: number;
          latitude?: number;
          longitude?: number;
          displayName?: string;
          logoText?: string;
          iconEmoji?: string;
          city?: string;
          state?: string;
          zipCode?: string;
          country?: string;
          county?: string;
          region?: string;
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
          resource: "pickem-settle";
          gameId: string;
          winningTeamId: string;
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
          scheduleType?: ChallengeScheduleType;
          activeDays?: string[];
          startDate?: string;
          startTime?: string;
          endDay?: string;
          endTime?: string;
          endDate?: string;
          gameTypes?: string[];
          challengeMode?: ChallengeMode;
          leaderboardDisplayLimit?: number;
          leaderboardTiebreaker?: ChallengeLeaderboardTiebreaker;
          pointMultiplier?: number;
          pointsRequiredToWin?: number;
          recurringType?: CampaignRecurringType;
          isActive?: boolean;
        }
      | {
          resource: "apply-placeholder-inline";
          templateAdId?: string;
          template?: {
            advertiserName?: string;
            imageUrl?: string;
            clickUrl?: string;
            width?: number;
            height?: number;
            altText?: string;
            adType?: AdType;
            displayTrigger?: AdDisplayTrigger;
            priority?: number;
            placementKey?: string;
            startDate?: string;
            endDate?: string | null;
            frequencyInterval?: number;
            dismissDelaySeconds?: number;
            popupCooldownSeconds?: number;
            sequenceIndex?: number;
          };
        }
      | {
          resource: "live-showdown-schedules";
          title: string;
          targetDate: string;
          startTime: string;
          timezone: string;
          recurringType?: CampaignRecurringType;
          recurringDays?: string[];
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
        }
      | {
          resource: "accounts";
          action: "set-god-mode";
          accountId: string;
          godMode: boolean;
        }
      | {
          resource: "accounts";
          action: "delete";
          accountId: string;
        };

    if (body.resource === "accounts") {
      const accountsBody = body as { resource: "accounts"; action: string; accountId?: string; godMode?: boolean };
      const accountId = String(accountsBody.accountId ?? "").trim();
      if (accountsBody.action === "set-god-mode") {
        const godMode = Boolean(accountsBody.godMode);
        if (!accountId) {
          return NextResponse.json({ ok: false, error: "accountId is required." }, { status: 400 });
        }
        await setAccountGodMode(accountId, godMode);
        return NextResponse.json({ ok: true });
      }
      if (accountsBody.action === "delete") {
        if (!accountId) {
          return NextResponse.json({ ok: false, error: "accountId is required." }, { status: 400 });
        }
        await deleteAdminAccount(accountId);
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ ok: false, error: "Unknown accounts action." }, { status: 400 });
    }

    if (resourceFromQuery === "apply-placeholder-inline" || body.resource === "apply-placeholder-inline") {
      const templateAdId = String((body as { templateAdId?: string }).templateAdId ?? "").trim() || undefined;
      const rawTemplate = (body as { template?: Record<string, unknown> }).template;
      const toNumberIfFinite = (value: unknown): number | undefined => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : undefined;
      };

      let template: PlaceholderAdTemplateInput | undefined = rawTemplate
        ? {
            advertiserName: typeof rawTemplate.advertiserName === "string" ? rawTemplate.advertiserName : undefined,
            imageUrl: typeof rawTemplate.imageUrl === "string" ? rawTemplate.imageUrl : undefined,
            clickUrl: typeof rawTemplate.clickUrl === "string" ? rawTemplate.clickUrl : undefined,
            width: toNumberIfFinite(rawTemplate.width),
            height: toNumberIfFinite(rawTemplate.height),
            altText: typeof rawTemplate.altText === "string" ? rawTemplate.altText : undefined,
            adType:
              rawTemplate.adType === "popup" || rawTemplate.adType === "banner" || rawTemplate.adType === "inline"
                ? (rawTemplate.adType as AdType)
                : undefined,
            displayTrigger:
              rawTemplate.displayTrigger === "on-load" ||
              rawTemplate.displayTrigger === "on-scroll" ||
              rawTemplate.displayTrigger === "round-end"
                ? (rawTemplate.displayTrigger as AdDisplayTrigger)
                : undefined,
            priority: toNumberIfFinite(rawTemplate.priority),
            placementKey: typeof rawTemplate.placementKey === "string" ? rawTemplate.placementKey : undefined,
            startDate: typeof rawTemplate.startDate === "string" ? rawTemplate.startDate : undefined,
            endDate:
              rawTemplate.endDate === null || typeof rawTemplate.endDate === "string"
                ? (rawTemplate.endDate as string | null)
                : undefined,
            frequencyInterval: toNumberIfFinite(rawTemplate.frequencyInterval),
            dismissDelaySeconds: toNumberIfFinite(rawTemplate.dismissDelaySeconds),
            popupCooldownSeconds: toNumberIfFinite(rawTemplate.popupCooldownSeconds),
            sequenceIndex: toNumberIfFinite(rawTemplate.sequenceIndex),
          }
        : undefined;

      if (templateAdId && !template) {
        const source = await getAdminAdvertisementById(templateAdId);
        if (!source) {
          return NextResponse.json({ ok: false, error: "Template ad not found." }, { status: 404 });
        }
        template = {
          advertiserName: source.advertiserName,
          imageUrl: source.imageUrl,
          clickUrl: source.clickUrl,
          width: source.width,
          height: source.height,
          altText: source.altText,
          adType: source.adType,
          displayTrigger: source.displayTrigger,
          priority: source.priority,
          placementKey: source.placementKey,
          startDate: source.startDate,
          endDate: source.endDate ?? null,
          frequencyInterval: source.frequencyInterval,
          dismissDelaySeconds: source.dismissDelaySeconds,
          popupCooldownSeconds: source.popupCooldownSeconds,
          sequenceIndex: source.sequenceIndex,
        };
      }

      const result = await applyPlaceholderAdToAllInlineSlots({
        templateAdId,
        template,
        adminUserId: auth.authUserId,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.resource === "trivia") {
      try {
        const item = await createAdminTriviaQuestion({
          question: body.question,
          options: body.options,
          acceptableAnswers: body.acceptableAnswers,
          correctAnswer: body.correctAnswer,
          category: body.category,
          difficulty: body.difficulty,
          questionPool: body.questionPool,
          answerFormat: body.answerFormat,
        });
        return NextResponse.json({ ok: true, item });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create trivia question.";
        console.error("[admin][trivia-bank]", {
          action: "create",
          questionType: body.questionPool === "live_showdown" ? "live" : "speed",
          questionId: null,
          category: body.category ?? null,
          error: message,
        });
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
      }
    }

    if (body.resource === "ads") {
      try {
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
          cities: body.cities,
          zipCodes: body.zipCodes,
          counties: body.counties,
          states: body.states,
          regions: body.regions,
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
      } catch (error) {
        return NextResponse.json(
          { ok: false, error: error instanceof Error ? error.message : "Failed to create advertisement." },
          { status: 400 }
        );
      }
    }

    if (body.resource === "venues") {
      const item = await createAdminVenue({
        name: body.name,
        street: body.street,
        address: body.address,
        radius: body.radius,
        latitude: body.latitude,
        longitude: body.longitude,
        displayName: body.displayName,
        logoText: body.logoText,
        iconEmoji: body.iconEmoji,
        city: body.city,
        state: body.state,
        zipCode: body.zipCode,
        country: body.country,
        county: body.county,
        region: body.region,
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

    if (body.resource === "pickem-settle") {
      const result = await settleAdminPickEmGame({
        gameId: body.gameId,
        winningTeamId: body.winningTeamId,
      });
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
        scheduleType: body.scheduleType,
        activeDays: body.activeDays,
        startDate: body.startDate,
        startTime: body.startTime,
        endDay: body.endDay,
        endTime: body.endTime,
        endDate: body.endDate,
        gameTypes: body.gameTypes,
        challengeMode: body.challengeMode,
        leaderboardDisplayLimit: body.leaderboardDisplayLimit,
        leaderboardTiebreaker: body.leaderboardTiebreaker,
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
        recurringType: body.recurringType,
        recurringDays: body.recurringDays,
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
          "Unknown resource. Use trivia, ads, venues, ads-track, predictions-settle, predictions-auto-settle, pickem-settle, challenge-campaigns, or live-showdown-schedules.",
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

    if (resource === "apply-placeholder-inline") {
      return NextResponse.json(
        { ok: false, error: "Method not allowed. Use POST for apply-placeholder-inline." },
        { status: 405 }
      );
    }

    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
    }

    if (resource === "trivia") {
      const questionType = searchParams.get("questionType");
      try {
        if (questionType === "live") {
          await deleteAdminLiveTriviaQuestionInFile(id);
          return NextResponse.json({ ok: true });
        }
        if (questionType === "speed") {
          await deleteAdminSpeedTriviaQuestionInFile(id);
          return NextResponse.json({ ok: true });
        }
        await deleteAdminTriviaQuestion(id);
        return NextResponse.json({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete trivia question.";
        console.error("[admin][trivia-bank]", {
          action: "delete",
          questionType: questionType === "live" ? "live" : questionType === "speed" ? "speed" : "generic",
          questionId: id,
          category: null,
          error: message,
        });
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
      }
    }

    if (resource === "ads") {
      await deleteAdminAdvertisement(id);
      return NextResponse.json({ ok: true });
    }

    if (resource === "venues") {
      await deleteAdminVenue(id);
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
        error: "Unknown resource. Use resource=trivia, resource=ads, resource=venues, resource=challenge-campaigns, or resource=live-showdown-schedules.",
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

    const { searchParams } = new URL(request.url);
    if (searchParams.get("resource") === "apply-placeholder-inline") {
      return NextResponse.json(
        { ok: false, error: "Method not allowed. Use POST for apply-placeholder-inline." },
        { status: 405 }
      );
    }

    const body = (await request.json()) as
      | {
          resource: "trivia";
          questionType?: "live" | "speed";
          id: string;
          question: string;
          options?: string[];
          acceptableAnswers?: string[];
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
          venueIds?: string[];
          targetAllVenues?: boolean;
          cities?: string[];
          zipCodes?: string[];
          counties?: string[];
          states?: string[];
          regions?: string[];
          /** Backward-compat aliases while older clients migrate. */
          venueId?: string;
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
          street?: string;
          address?: string;
          radius: number;
          latitude?: number;
          longitude?: number;
          city?: string;
          state?: string;
          zipCode?: string;
          country?: string;
          county?: string;
          region?: string;
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
          scheduleType?: ChallengeScheduleType;
          activeDays?: string[];
          startDate?: string;
          startTime?: string;
          endDay?: string;
          endTime?: string;
          endDate?: string;
          gameTypes?: string[];
          challengeMode?: ChallengeMode;
          leaderboardDisplayLimit?: number;
          leaderboardTiebreaker?: ChallengeLeaderboardTiebreaker;
          pointMultiplier?: number;
          pointsRequiredToWin?: number;
          recurringType?: CampaignRecurringType;
          displayOrder?: number | null;
          winnerUserId?: string | null;
          isActive?: boolean;
        }
      | {
          resource: "ads-placement";
          updates: Array<{ id: string; slotKey: string; priority: number }>;
        }
      | {
          resource: "ads-bulk";
          action: "delete" | "enable" | "disable";
          ids: string[];
        }
      | {
          resource: "trivia-bulk";
          ids: string[];
          questionPool?: "anytime_blitz" | "live_showdown";
          answerFormat?: "multiple_choice" | "write_in" | "numeric" | "true_false";
        }
      | {
          resource: "live-showdown-session-questions";
          scheduleId: string;
          questions: Array<{ id: string; roundNumber: number; questionIndex: number; questionId: string }>;
        }
      | {
          resource: "live-showdown-replace-round";
          scheduleId: string;
          roundNumber: number;
          category: string;
        }
      | {
          resource: "live-showdown-replace-question";
          scheduleId: string;
          roundNumber: number;
          questionIndex: number;
          excludeSlug: string;
          category: string;
        }
      | {
          resource: "live-showdown-swap-question";
          scheduleId: string;
          roundNumber: number;
          questionIndex: number;
          excludeSlug: string;
          category: string;
        }
      | {
          resource: "live-showdown-schedules";
          id: string;
          title: string;
          targetDate: string;
          startTime: string;
          timezone: string;
          recurringType?: CampaignRecurringType;
          recurringDays?: string[];
          numRounds: number;
          venueId: string;
          intermissionAdDelaySeconds?: number;
          lobbyAdEnabled?: boolean;
        };

    if (body.resource === "trivia") {
      try {
        if (body.questionType === "live") {
          const answer = body.options?.[body.correctAnswer ?? 0] ?? body.options?.[0] ?? "";
          const item = await updateAdminLiveTriviaQuestionInFile({
            slug: body.id,
            question: body.question,
            answer,
            acceptableAnswers: body.acceptableAnswers ?? body.options?.filter((_, index) => index !== (body.correctAnswer ?? 0)),
            category: body.category,
            difficulty: body.difficulty,
          });
          return NextResponse.json({ ok: true, item });
        }
        if (body.questionType === "speed") {
          const item = await updateAdminSpeedTriviaQuestionInFile({
            slug: body.id,
            question: body.question,
            options: body.options ?? [],
            correctAnswer: body.correctAnswer ?? 0,
            category: body.category,
            difficulty: body.difficulty,
          });
          return NextResponse.json({ ok: true, item });
        }
        const item = await updateAdminTriviaQuestion({
          id: body.id,
          question: body.question,
          options: body.options,
          acceptableAnswers: body.acceptableAnswers,
          correctAnswer: body.correctAnswer,
          category: body.category,
          difficulty: body.difficulty,
          questionPool: body.questionPool,
          answerFormat: body.answerFormat,
        });
        return NextResponse.json({ ok: true, item });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update trivia question.";
        console.error("[admin][trivia-bank]", {
          action: "update",
          questionType: body.questionType ?? "generic",
          questionId: body.id ?? null,
          category: body.category ?? null,
          error: message,
        });
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
      }
    }

    if (body.resource === "ads") {
      try {
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
          cities: body.cities,
          zipCodes: body.zipCodes,
          counties: body.counties,
          states: body.states,
          regions: body.regions,
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
      } catch (error) {
        return NextResponse.json(
          { ok: false, error: error instanceof Error ? error.message : "Failed to update advertisement." },
          { status: 400 }
        );
      }
    }

    if (body.resource === "venues") {
      const item = await updateAdminVenue({
        id: body.id,
        name: body.name,
        displayName: body.displayName,
        logoText: body.logoText,
        iconEmoji: body.iconEmoji,
        street: body.street,
        address: body.address,
        radius: body.radius,
        latitude: body.latitude,
        longitude: body.longitude,
        city: body.city,
        state: body.state,
        zipCode: body.zipCode,
        country: body.country,
        county: body.county,
        region: body.region,
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
        scheduleType: body.scheduleType,
        activeDays: body.activeDays,
        startDate: body.startDate,
        startTime: body.startTime,
        endDay: body.endDay,
        endTime: body.endTime,
        endDate: body.endDate,
        gameTypes: body.gameTypes,
        challengeMode: body.challengeMode,
        leaderboardDisplayLimit: body.leaderboardDisplayLimit,
        leaderboardTiebreaker: body.leaderboardTiebreaker,
        pointMultiplier: body.pointMultiplier,
        pointsRequiredToWin: body.pointsRequiredToWin,
        recurringType: body.recurringType,
        displayOrder: body.displayOrder,
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

    if (body.resource === "ads-bulk") {
      if (!Array.isArray(body.ids) || body.ids.length === 0) {
        return NextResponse.json({ ok: false, error: "ids is required." }, { status: 400 });
      }
      if (body.action === "delete") {
        const deleted = await bulkDeleteAdminAdvertisements(body.ids);
        return NextResponse.json({ ok: true, deleted });
      }
      if (body.action === "enable" || body.action === "disable") {
        const updated = await bulkSetAdminAdvertisementsActive(body.ids, body.action === "enable");
        return NextResponse.json({ ok: true, updated });
      }
      return NextResponse.json({ ok: false, error: "Invalid bulk ads action." }, { status: 400 });
    }

    if (body.resource === "live-showdown-session-questions") {
      const scheduleId = String(body.scheduleId ?? "").trim();
      const questions = body.questions as Array<{ id: string; roundNumber: number; questionIndex: number; questionId: string }> | undefined;
      if (!scheduleId) {
        return NextResponse.json({ ok: false, error: "scheduleId is required." }, { status: 400 });
      }
      if (!Array.isArray(questions) || questions.length === 0) {
        return NextResponse.json({ ok: false, error: "questions array is required." }, { status: 400 });
      }
      await updateAdminLiveShowdownSessionQuestions(scheduleId, questions);
      return NextResponse.json({ ok: true });
    }

    if (body.resource === "live-showdown-replace-round") {
      const scheduleId = String(body.scheduleId ?? "").trim();
      const roundNumber = Number(body.roundNumber);
      const category = String(body.category ?? "").trim();
      if (!scheduleId) {
        return NextResponse.json({ ok: false, error: "scheduleId is required." }, { status: 400 });
      }
      if (!Number.isInteger(roundNumber) || roundNumber < 1) {
        return NextResponse.json({ ok: false, error: "roundNumber must be a positive integer." }, { status: 400 });
      }
      if (!category) {
        return NextResponse.json({ ok: false, error: "category is required." }, { status: 400 });
      }
      const items = await replaceRoundQuestionsWithCategory(scheduleId, roundNumber, category);
      return NextResponse.json({ ok: true, items });
    }

    if (body.resource === "live-showdown-replace-question") {
      const scheduleId = String(body.scheduleId ?? "").trim();
      const roundNumber = Number(body.roundNumber);
      const questionIndex = Number(body.questionIndex);
      const excludeSlug = String(body.excludeSlug ?? "").trim();
      const category = String(body.category ?? "").trim();
      if (!scheduleId) {
        return NextResponse.json({ ok: false, error: "scheduleId is required." }, { status: 400 });
      }
      if (!Number.isInteger(roundNumber) || roundNumber < 1) {
        return NextResponse.json({ ok: false, error: "roundNumber must be a positive integer." }, { status: 400 });
      }
      if (!Number.isInteger(questionIndex) || questionIndex < 1) {
        return NextResponse.json({ ok: false, error: "questionIndex must be a positive integer." }, { status: 400 });
      }
      if (!excludeSlug) {
        return NextResponse.json({ ok: false, error: "excludeSlug is required." }, { status: 400 });
      }
      if (!category) {
        return NextResponse.json({ ok: false, error: "category is required." }, { status: 400 });
      }
      const item = await replaceSingleSessionQuestion(scheduleId, roundNumber, questionIndex, excludeSlug, category);
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "live-showdown-swap-question") {
      const scheduleId = String(body.scheduleId ?? "").trim();
      const roundNumber = Number(body.roundNumber);
      const questionIndex = Number(body.questionIndex);
      const excludeSlug = String(body.excludeSlug ?? "").trim();
      const category = String(body.category ?? "").trim();
      if (!scheduleId) return NextResponse.json({ ok: false, error: "scheduleId is required." }, { status: 400 });
      if (!Number.isInteger(roundNumber) || roundNumber < 1) return NextResponse.json({ ok: false, error: "roundNumber must be a positive integer." }, { status: 400 });
      if (!Number.isInteger(questionIndex) || questionIndex < 1) return NextResponse.json({ ok: false, error: "questionIndex must be a positive integer." }, { status: 400 });
      if (!excludeSlug) return NextResponse.json({ ok: false, error: "excludeSlug is required." }, { status: 400 });
      if (!category) return NextResponse.json({ ok: false, error: "category is required." }, { status: 400 });
      const item = await swapSessionQuestion(scheduleId, roundNumber, questionIndex, excludeSlug, category);
      return NextResponse.json({ ok: true, item });
    }

    if (body.resource === "live-showdown-schedules") {
      const item = await updateAdminLiveShowdownSchedule({
        id: body.id,
        title: body.title,
        targetDate: body.targetDate,
        startTime: body.startTime,
        timezone: body.timezone,
        recurringType: body.recurringType,
        recurringDays: body.recurringDays,
        numRounds: body.numRounds,
        venueId: body.venueId,
        intermissionAdDelaySeconds: body.intermissionAdDelaySeconds,
        lobbyAdEnabled: body.lobbyAdEnabled,
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
