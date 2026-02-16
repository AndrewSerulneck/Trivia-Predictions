"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureAnonymousSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { AdSlot, Advertisement, TriviaQuestion, Venue } from "@/types";

const AD_SLOTS: AdSlot[] = [
  "header",
  "inline-content",
  "sidebar",
  "mid-content",
  "leaderboard-sidebar",
  "footer",
];

type LoadState = "idle" | "loading" | "error";
type AdminAdsDebugSnapshot = {
  generatedAt: string;
  windowHours: number;
  windowStart: string;
  totalAds: number;
  activeAds: number;
  totalImpressions: number;
  totalClicks: number;
  overallCtr: number;
  windowImpressions: number;
  windowClicks: number;
  windowCtr: number;
  slotCoverage: Array<{ slot: AdSlot; hasActiveAd: boolean; activeCount: number }>;
  topByImpressions: Advertisement[];
  topByClicks: Advertisement[];
  topByCtr: Advertisement[];
  topByWindowImpressions: Advertisement[];
  topByWindowClicks: Advertisement[];
  topByWindowCtr: Advertisement[];
  windowMetricsByAd: Record<string, { impressions: number; clicks: number; ctr: number }>;
};
type AdminPendingPredictionSummary = {
  predictionId: string;
  totalPicks: number;
  latestPickAt: string;
  outcomes: Array<{ outcomeId: string; outcomeTitle: string; pickCount: number }>;
};
type AdminVenueUser = {
  id: string;
  username: string;
  venueId: string;
  points: number;
  isAdmin: boolean;
  createdAt: string;
};

export function AdminConsole({ venues }: { venues: Venue[] }) {
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adsWindowHours, setAdsWindowHours] = useState(24);
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [adsDebug, setAdsDebug] = useState<AdminAdsDebugSnapshot | null>(null);
  const [pendingPredictions, setPendingPredictions] = useState<AdminPendingPredictionSummary[]>([]);
  const [selectedVenueUserId, setSelectedVenueUserId] = useState(() => venues[0]?.id ?? "");
  const [venueUsers, setVenueUsers] = useState<AdminVenueUser[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserUsername, setEditUserUsername] = useState("");
  const [editUserPoints, setEditUserPoints] = useState(0);
  const [settlingPredictionId, setSettlingPredictionId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("Option A, Option B");
  const [correctAnswer, setCorrectAnswer] = useState(0);
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");

  const [slot, setSlot] = useState<AdSlot>("header");
  const [venueId, setVenueId] = useState("");
  const [advertiserName, setAdvertiserName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [clickUrl, setClickUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [width, setWidth] = useState(728);
  const [height, setHeight] = useState(90);
  const [active, setActive] = useState(true);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [endDate, setEndDate] = useState("");

  const [editQuestionText, setEditQuestionText] = useState("");
  const [editOptionsText, setEditOptionsText] = useState("");
  const [editCorrectAnswer, setEditCorrectAnswer] = useState(0);
  const [editCategory, setEditCategory] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("");

  const [editSlot, setEditSlot] = useState<AdSlot>("header");
  const [editVenueId, setEditVenueId] = useState("");
  const [editAdvertiserName, setEditAdvertiserName] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editClickUrl, setEditClickUrl] = useState("");
  const [editAltText, setEditAltText] = useState("");
  const [editWidth, setEditWidth] = useState(728);
  const [editHeight, setEditHeight] = useState(90);
  const [editActive, setEditActive] = useState(true);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

  const parsedOptions = useMemo(
    () => optionsText.split(",").map((item) => item.trim()).filter(Boolean),
    [optionsText]
  );
  const parsedEditOptions = useMemo(
    () => editOptionsText.split(",").map((item) => item.trim()).filter(Boolean),
    [editOptionsText]
  );

  const adminFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!accessToken) {
      throw new Error("No auth session available. Reload and try again.");
    }

    return fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }, [accessToken]);

  const loadAll = useCallback(async () => {
    setState("loading");
    setErrorMessage("");
    try {
      const [triviaResponse, adResponse, adsDebugResponse, pendingPredictionsResponse] = await Promise.all([
        adminFetch("/api/admin?resource=trivia", { cache: "no-store" }),
        adminFetch("/api/admin?resource=ads", { cache: "no-store" }),
        adminFetch(`/api/admin?resource=ads-debug&windowHours=${adsWindowHours}`, { cache: "no-store" }),
        adminFetch("/api/admin?resource=predictions-pending", { cache: "no-store" }),
      ]);

      const triviaPayload = (await triviaResponse.json()) as {
        ok: boolean;
        items?: TriviaQuestion[];
        error?: string;
      };
      const adPayload = (await adResponse.json()) as {
        ok: boolean;
        items?: Advertisement[];
        error?: string;
      };
      const adsDebugPayload = (await adsDebugResponse.json()) as {
        ok: boolean;
        snapshot?: AdminAdsDebugSnapshot;
        error?: string;
      };
      const pendingPredictionsPayload = (await pendingPredictionsResponse.json()) as {
        ok: boolean;
        items?: AdminPendingPredictionSummary[];
        error?: string;
      };

      if (!triviaPayload.ok) {
        throw new Error(triviaPayload.error ?? "Failed to load trivia.");
      }
      if (!adPayload.ok) {
        throw new Error(adPayload.error ?? "Failed to load ads.");
      }
      if (!adsDebugPayload.ok) {
        throw new Error(adsDebugPayload.error ?? "Failed to load ad debug snapshot.");
      }
      if (!pendingPredictionsPayload.ok) {
        throw new Error(pendingPredictionsPayload.error ?? "Failed to load pending predictions.");
      }

      setQuestions(triviaPayload.items ?? []);
      setAds(adPayload.items ?? []);
      setAdsDebug(adsDebugPayload.snapshot ?? null);
      setPendingPredictions(pendingPredictionsPayload.items ?? []);
      setState("idle");
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load admin data.");
    }
  }, [adminFetch, adsWindowHours]);

  const loadVenueUsers = useCallback(async () => {
    if (!selectedVenueUserId) {
      setVenueUsers([]);
      return;
    }

    try {
      const response = await adminFetch(
        `/api/admin/users?venueId=${encodeURIComponent(selectedVenueUserId)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as {
        ok: boolean;
        users?: AdminVenueUser[];
        error?: string;
      };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load venue users.");
      }
      setVenueUsers(payload.users ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load venue users.");
    }
  }, [adminFetch, selectedVenueUserId]);

  useEffect(() => {
    const init = async () => {
      try {
        await ensureAnonymousSession();
        const { data, error } = await supabase!.auth.getSession();
        if (error) {
          throw error;
        }

        const token = data.session?.access_token ?? "";
        if (!token) {
          throw new Error("No auth session token was returned.");
        }

        setAccessToken(token);
      } catch (error) {
        setState("error");
        setErrorMessage(error instanceof Error ? error.message : "Failed to initialize admin session.");
      }
    };

    void init();
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    void loadAll();
  }, [accessToken, loadAll]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    void loadVenueUsers();
  }, [accessToken, loadVenueUsers]);

  const createTrivia = async () => {
    setErrorMessage("");
    try {
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "trivia",
          question,
          options: parsedOptions,
          correctAnswer,
          category,
          difficulty,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to create trivia question.");
      }
      setQuestion("");
      setOptionsText("Option A, Option B");
      setCorrectAnswer(0);
      setCategory("");
      setDifficulty("");
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create trivia question.");
    }
  };

  const createAd = async () => {
    setErrorMessage("");
    try {
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "ads",
          slot,
          venueId: venueId || undefined,
          advertiserName,
          imageUrl,
          clickUrl,
          altText,
          width,
          height,
          active,
          startDate: new Date(startDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to create ad.");
      }
      setAdvertiserName("");
      setImageUrl("");
      setClickUrl("");
      setAltText("");
      setWidth(728);
      setHeight(90);
      setActive(true);
      setEndDate("");
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create ad.");
    }
  };

  const deleteItem = async (resource: "trivia" | "ads", id: string) => {
    setErrorMessage("");
    try {
      const response = await adminFetch(`/api/admin?resource=${resource}&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Delete failed.");
      }
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Delete failed.");
    }
  };

  const simulateAdEvent = async (adId: string, eventType: "impression" | "click") => {
    setErrorMessage("");
    try {
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "ads-track",
          adId,
          eventType,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to simulate ad event.");
      }
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to simulate ad event.");
    }
  };

  const settlePredictionMarket = async (params: {
    predictionId: string;
    winningOutcomeId?: string;
    settleAsCanceled?: boolean;
  }) => {
    setErrorMessage("");
    setSettlingPredictionId(params.predictionId);
    try {
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "predictions-settle",
          predictionId: params.predictionId,
          winningOutcomeId: params.winningOutcomeId,
          settleAsCanceled: params.settleAsCanceled,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to settle prediction market.");
      }
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to settle prediction market.");
    } finally {
      setSettlingPredictionId(null);
    }
  };

  const beginEditUser = (user: AdminVenueUser) => {
    setEditingUserId(user.id);
    setEditUserUsername(user.username);
    setEditUserPoints(user.points);
  };

  const saveUserEdit = async () => {
    if (!editingUserId) {
      return;
    }

    setErrorMessage("");
    try {
      const response = await adminFetch(`/api/admin/users/${encodeURIComponent(editingUserId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: editUserUsername,
          points: editUserPoints,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to update user.");
      }
      setEditingUserId(null);
      await Promise.all([loadVenueUsers(), loadAll()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update user.");
    }
  };

  const beginEditQuestion = (item: TriviaQuestion) => {
    setEditingQuestionId(item.id);
    setEditQuestionText(item.question);
    setEditOptionsText(item.options.join(", "));
    setEditCorrectAnswer(item.correctAnswer);
    setEditCategory(item.category ?? "");
    setEditDifficulty(item.difficulty ?? "");
  };

  const saveQuestionEdit = async () => {
    if (!editingQuestionId) return;
    setErrorMessage("");
    try {
      const response = await adminFetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "trivia",
          id: editingQuestionId,
          question: editQuestionText,
          options: parsedEditOptions,
          correctAnswer: editCorrectAnswer,
          category: editCategory,
          difficulty: editDifficulty,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to update trivia question.");
      }
      setEditingQuestionId(null);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update trivia question.");
    }
  };

  const beginEditAd = (item: Advertisement) => {
    setEditingAdId(item.id);
    setEditSlot(item.slot);
    setEditVenueId(item.venueId ?? "");
    setEditAdvertiserName(item.advertiserName);
    setEditImageUrl(item.imageUrl);
    setEditClickUrl(item.clickUrl);
    setEditAltText(item.altText);
    setEditWidth(item.width);
    setEditHeight(item.height);
    setEditActive(item.active);
    setEditStartDate(item.startDate.slice(0, 16));
    setEditEndDate(item.endDate ? item.endDate.slice(0, 16) : "");
  };

  const saveAdEdit = async () => {
    if (!editingAdId) return;
    setErrorMessage("");
    try {
      const response = await adminFetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "ads",
          id: editingAdId,
          slot: editSlot,
          venueId: editVenueId || undefined,
          advertiserName: editAdvertiserName,
          imageUrl: editImageUrl,
          clickUrl: editClickUrl,
          altText: editAltText,
          width: editWidth,
          height: editHeight,
          active: editActive,
          startDate: new Date(editStartDate).toISOString(),
          endDate: editEndDate ? new Date(editEndDate).toISOString() : undefined,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to update ad.");
      }
      setEditingAdId(null);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update ad.");
    }
  };

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}
      {state === "loading" && <p className="text-sm text-slate-600">Loading admin data...</p>}

      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Ad Debug Snapshot</h2>
          <div className="flex items-center gap-2">
            <select
              value={adsWindowHours}
              onChange={(event) => setAdsWindowHours(Number(event.target.value))}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            >
              <option value={24}>Last 24h</option>
              <option value={168}>Last 7d</option>
              <option value={720}>Last 30d</option>
            </select>
            <button
              type="button"
              onClick={() => {
                void loadAll();
              }}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
            >
              Refresh
            </button>
          </div>
        </div>

        {!adsDebug ? (
          <p className="text-sm text-slate-600">No snapshot available yet.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-500">
              Generated: {new Date(adsDebug.generatedAt).toLocaleString()}
            </p>
            <p className="text-xs text-slate-500">
              Window start: {new Date(adsDebug.windowStart).toLocaleString()}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Total Ads</p>
                <p className="font-semibold">{adsDebug.totalAds}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Active Now</p>
                <p className="font-semibold">{adsDebug.activeAds}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Impressions</p>
                <p className="font-semibold">{adsDebug.totalImpressions}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Overall CTR</p>
                <p className="font-semibold">{adsDebug.overallCtr.toFixed(2)}%</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Window Impr</p>
                <p className="font-semibold">{adsDebug.windowImpressions}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Window Clicks</p>
                <p className="font-semibold">{adsDebug.windowClicks}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Window CTR</p>
                <p className="font-semibold">{adsDebug.windowCtr.toFixed(2)}%</p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Slot Coverage</p>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {adsDebug.slotCoverage.map((item) => (
                  <li key={item.slot} className="rounded-md border border-slate-200 px-2 py-1.5 text-xs">
                    <span className="font-medium">{item.slot}</span>:{" "}
                    {item.hasActiveAd ? `${item.activeCount} active` : "none"}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Top Impressions</p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByImpressions.map((ad) => (
                    <li key={`impr-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                      {ad.advertiserName} ({ad.impressions ?? 0})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Top Clicks</p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByClicks.map((ad) => (
                    <li key={`clk-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                      {ad.advertiserName} ({ad.clicks ?? 0})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Top CTR</p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByCtr.map((ad) => {
                    const ctr =
                      (ad.impressions ?? 0) > 0 ? (((ad.clicks ?? 0) / (ad.impressions ?? 0)) * 100).toFixed(2) : "0.00";
                    return (
                      <li key={`ctr-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                        {ad.advertiserName} ({ctr}%)
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Top Window Impr
                </p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByWindowImpressions.map((ad) => (
                    <li key={`wimpr-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                      {ad.advertiserName} ({adsDebug.windowMetricsByAd[ad.id]?.impressions ?? 0})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Top Window Clicks
                </p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByWindowClicks.map((ad) => (
                    <li key={`wclk-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                      {ad.advertiserName} ({adsDebug.windowMetricsByAd[ad.id]?.clicks ?? 0})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Top Window CTR
                </p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByWindowCtr.map((ad) => (
                    <li key={`wctr-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                      {ad.advertiserName} ({(adsDebug.windowMetricsByAd[ad.id]?.ctr ?? 0).toFixed(2)}%)
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Pending Prediction Settlement</h2>
        {pendingPredictions.length === 0 ? (
          <p className="text-sm text-slate-600">No pending prediction markets to settle.</p>
        ) : (
          <ul className="space-y-2">
            {pendingPredictions.map((market) => (
              <li key={market.predictionId} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-medium">Market: {market.predictionId}</p>
                <p className="text-xs text-slate-500">
                  Picks: {market.totalPicks} | Latest: {new Date(market.latestPickAt).toLocaleString()}
                </p>
                <div className="mt-2 space-y-2">
                  {market.outcomes.map((outcome) => (
                    <div
                      key={`${market.predictionId}-${outcome.outcomeId}`}
                      className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5"
                    >
                      <p className="text-xs text-slate-700">
                        {outcome.outcomeTitle} ({outcome.pickCount} picks)
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          void settlePredictionMarket({
                            predictionId: market.predictionId,
                            winningOutcomeId: outcome.outcomeId,
                          });
                        }}
                        disabled={settlingPredictionId === market.predictionId}
                        className="rounded-md bg-emerald-700 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                      >
                        Settle Winner
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void settlePredictionMarket({
                      predictionId: market.predictionId,
                      settleAsCanceled: true,
                    });
                  }}
                  disabled={settlingPredictionId === market.predictionId}
                  className="mt-2 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  Settle as Canceled
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Venue User Management</h2>
        <div className="max-w-sm">
          <select
            value={selectedVenueUserId}
            onChange={(event) => setSelectedVenueUserId(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>

        {venueUsers.length === 0 ? (
          <p className="text-sm text-slate-600">No users found for this venue.</p>
        ) : (
          <ul className="space-y-2">
            {venueUsers.map((user) => (
              <li key={user.id} className="rounded-md border border-slate-200 p-2 text-sm">
                {editingUserId === user.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={editUserUsername}
                        onChange={(event) => setEditUserUsername(event.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={editUserPoints}
                        onChange={(event) => setEditUserPoints(Number(event.target.value))}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void saveUserEdit();
                        }}
                        className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingUserId(null)}
                        className="rounded-md bg-slate-500 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium">
                      {user.username}
                      {user.isAdmin ? (
                        <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          Admin
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-500">
                      Points: {user.points} | Joined: {new Date(user.createdAt).toLocaleString()}
                    </p>
                    <button
                      type="button"
                      onClick={() => beginEditUser(user)}
                      className="mt-2 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Edit User
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Create Trivia Question</h2>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Question text"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={optionsText}
          onChange={(event) => setOptionsText(event.target.value)}
          placeholder="Comma separated options"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            type="number"
            min={0}
            value={correctAnswer}
            onChange={(event) => setCorrectAnswer(Number(event.target.value))}
            placeholder="Correct index"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Category"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
            placeholder="Difficulty"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <p className="text-xs text-slate-500">Current options count: {parsedOptions.length}</p>
        <button
          type="button"
          onClick={() => {
            void createTrivia();
          }}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Create Question
        </button>
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Create Advertisement</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select
            value={slot}
            onChange={(event) => setSlot(event.target.value as AdSlot)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {AD_SLOTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={venueId}
            onChange={(event) => setVenueId(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Global (all venues)</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>
        <input
          value={advertiserName}
          onChange={(event) => setAdvertiserName(event.target.value)}
          placeholder="Advertiser name"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          placeholder="Image URL"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={clickUrl}
          onChange={(event) => setClickUrl(event.target.value)}
          placeholder="Click URL"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={altText}
          onChange={(event) => setAltText(event.target.value)}
          placeholder="Alt text"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            type="number"
            min={1}
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
            placeholder="Width"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            min={1}
            value={height}
            onChange={(event) => setHeight(Number(event.target.value))}
            placeholder="Height"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            type="datetime-local"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          Active
        </label>
        <button
          type="button"
          onClick={() => {
            void createAd();
          }}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white"
        >
          Create Advertisement
        </button>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Trivia Questions ({questions.length})</h2>
        <ul className="space-y-2">
          {questions.map((item) => (
            <li key={item.id} className="rounded-md border border-slate-200 p-2 text-sm">
              {editingQuestionId === item.id ? (
                <div className="space-y-2">
                  <input
                    value={editQuestionText}
                    onChange={(event) => setEditQuestionText(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={editOptionsText}
                    onChange={(event) => setEditOptionsText(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="number"
                      min={0}
                      value={editCorrectAnswer}
                      onChange={(event) => setEditCorrectAnswer(Number(event.target.value))}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      value={editCategory}
                      onChange={(event) => setEditCategory(event.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      value={editDifficulty}
                      onChange={(event) => setEditDifficulty(event.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void saveQuestionEdit();
                      }}
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingQuestionId(null)}
                      className="rounded-md bg-slate-500 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-medium">{item.question}</p>
                  <p className="text-xs text-slate-600">
                    Correct: {item.options[item.correctAnswer] ?? "n/a"} | {item.category ?? "uncategorized"} |{" "}
                    {item.difficulty ?? "unspecified"}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => beginEditQuestion(item)}
                      className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteItem("trivia", item.id);
                      }}
                      className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Advertisements ({ads.length})</h2>
        <ul className="space-y-2">
          {ads.map((item) => (
            <li key={item.id} className="rounded-md border border-slate-200 p-2 text-sm">
              {editingAdId === item.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <select
                      value={editSlot}
                      onChange={(event) => setEditSlot(event.target.value as AdSlot)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      {AD_SLOTS.map((slotOption) => (
                        <option key={slotOption} value={slotOption}>
                          {slotOption}
                        </option>
                      ))}
                    </select>
                    <select
                      value={editVenueId}
                      onChange={(event) => setEditVenueId(event.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Global (all venues)</option>
                      {venues.map((venue) => (
                        <option key={venue.id} value={venue.id}>
                          {venue.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    value={editAdvertiserName}
                    onChange={(event) => setEditAdvertiserName(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={editImageUrl}
                    onChange={(event) => setEditImageUrl(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={editClickUrl}
                    onChange={(event) => setEditClickUrl(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={editAltText}
                    onChange={(event) => setEditAltText(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="number"
                      min={1}
                      value={editWidth}
                      onChange={(event) => setEditWidth(Number(event.target.value))}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      value={editHeight}
                      onChange={(event) => setEditHeight(Number(event.target.value))}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="datetime-local"
                      value={editStartDate}
                      onChange={(event) => setEditStartDate(event.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="datetime-local"
                      value={editEndDate}
                      onChange={(event) => setEditEndDate(event.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(event) => setEditActive(event.target.checked)}
                    />
                    Active
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void saveAdEdit();
                      }}
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAdId(null)}
                      className="rounded-md bg-slate-500 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-medium">{item.advertiserName}</p>
                  <p className="text-xs text-slate-600">
                    {item.slot} | {item.width}x{item.height} | {item.active ? "active" : "inactive"} |{" "}
                    {item.venueId ?? "global"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Impressions: {item.impressions ?? 0} | Clicks: {item.clicks ?? 0} | CTR:{" "}
                    {item.impressions && item.impressions > 0
                      ? `${(((item.clicks ?? 0) / item.impressions) * 100).toFixed(2)}%`
                      : "0.00%"}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => beginEditAd(item)}
                      className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void simulateAdEvent(item.id, "impression");
                      }}
                      className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Test Impression
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void simulateAdEvent(item.id, "click");
                      }}
                      className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Test Click
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteItem("ads", item.id);
                      }}
                      className="rounded-md bg-rose-700 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
