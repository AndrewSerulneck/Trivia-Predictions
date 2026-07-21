"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { Venue } from "@/types";
import { PaginationBar, BulkActionBar, TH, TD, TR } from "@/components/admin/AdminShell";
import { adminField, adminLabel } from "@/lib/adminStyles";
import {
  CreateRewardWizard,
  type CreateRewardSubmission,
  type RewardCreationContextDTO,
} from "@/components/rewards/CreateRewardWizard";

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignRecurringType = "none" | "daily" | "weekly" | "monthly" | "yearly";
type ChallengeMode = "progress" | "leaderboard";
type ChallengeLeaderboardTiebreaker = "first_to_score" | "latest_activity";
type PrizeType = "wine_bottle" | "free_appetizer" | "gift_certificate";

type CycleWinnerRecord = {
  id: string;
  challengeId: string;
  cycleStart: string;
  winnerUserId: string;
  winnerUsername: string | null;
  venueId: string;
  pointsEarned: number;
  finalizedAt: string;
  prizeType: string | null;
  prizeRedeemedAt: string | null;
};

type FinalizedPrize = {
  winnerUserId: string;
  winnerUsername: string | null;
  prizeType: string | null;
  prizeGiftCertificateAmount: number | null;
  prizeExpiresAt: string | null;
  prizeRedeemedAt: string | null;
  claimedAt: string | null;
};

type AdminChallengeCampaign = {
  id: string;
  createdAt: string;
  name: string;
  imageUrl?: string;
  rules: string;
  venueIds: string[];
  scheduleType: "single_day" | "multi_day" | "recurring" | "one_time";
  activeDays: string[];
  startDate?: string;
  startTime?: string;
  endDay?: string;
  endTime?: string;
  endDate?: string;
  gameTypes: string[];
  challengeMode: ChallengeMode;
  leaderboardDisplayLimit: number;
  leaderboardTiebreaker: ChallengeLeaderboardTiebreaker;
  pointMultiplier: number;
  pointsRequiredToWin: number;
  recurringType: CampaignRecurringType;
  displayOrder?: number | null;
  winnerUserId?: string | null;
  winnerUsername?: string | null;
  prizeType?: PrizeType | null;
  prizeGiftCertificateAmount?: number | null;
  isActive: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const GAME_TYPE_OPTIONS = ["pickem", "fantasy", "speed-trivia", "live-trivia", "bingo"] as const;
const PRIZE_TYPE_OPTIONS: Array<{ value: PrizeType | "none"; label: string }> = [
  { value: "none", label: "No Prize" },
  { value: "wine_bottle", label: "Bottle of Wine" },
  { value: "free_appetizer", label: "Free Appetizer" },
  { value: "gift_certificate", label: "Gift Certificate" },
];
const DAY_OPTIONS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const RECURRING_OPTIONS: CampaignRecurringType[] = ["none", "daily", "weekly", "monthly", "yearly"];
// Rewards are threshold/progress only going forward — leaderboard mode is retired from
// creation. It's only offered here when editing a campaign that's already leaderboard
// mode, so in-flight leaderboard campaigns can still be edited until they finish out.
const CHALLENGE_MODE_OPTIONS: ChallengeMode[] = ["progress"];
const LEADERBOARD_TIEBREAKER_OPTIONS: ChallengeLeaderboardTiebreaker[] = ["first_to_score", "latest_activity"];

function gameTypeLabel(gameType: string): string {
  if (gameType === "pickem") return "Pick 'Em";
  if (gameType === "fantasy") return "Fantasy";
  if (gameType === "speed-trivia" || gameType === "trivia") return "Speed Trivia";
  if (gameType === "live-trivia" || gameType === "live_trivia") return "Live Trivia";
  if (gameType === "bingo") return "Bingo";
  return gameType;
}

function normalizeFormGameType(gameType: string): string {
  const normalized = String(gameType ?? "").trim().toLowerCase();
  if (normalized === "trivia") return "speed-trivia";
  if (normalized === "live_trivia") return "live-trivia";
  return normalized;
}

function challengeModeLabel(mode: ChallengeMode): string {
  return mode === "leaderboard" ? "Leaderboard" : "Progress Gauge";
}

function leaderboardTiebreakerLabel(value: ChallengeLeaderboardTiebreaker): string {
  return value === "latest_activity" ? "Latest activity" : "First to score";
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ isActive, hasWinner }: { isActive: boolean; hasWinner: boolean }) {
  if (hasWinner) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Resolved
      </span>
    );
  }
  return isActive ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      Active
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
      Inactive
    </span>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

type ChallengesSectionProps = {
  venues: Venue[];
};

type ViewMode = "list" | "create" | "edit";

export function ChallengesSection({ venues }: ChallengesSectionProps) {
  const [mode, setMode] = useState<ViewMode>("list");
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("all");
  const [campaigns, setCampaigns] = useState<AdminChallengeCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [expandedWinnersId, setExpandedWinnersId] = useState<string | null>(null);
  const [cycleWinnersCache, setCycleWinnersCache] = useState<Record<string, CycleWinnerRecord[]>>({});
  const [winnersLoading, setWinnersLoading] = useState(false);
  const [expandedPrizeId, setExpandedPrizeId] = useState<string | null>(null);
  const [finalizedPrizeCache, setFinalizedPrizeCache] = useState<Record<string, FinalizedPrize | null>>({});
  const [prizeLoading, setPrizeLoading] = useState(false);

  async function toggleWinnersPanel(campaignId: string) {
    if (expandedWinnersId === campaignId) {
      setExpandedWinnersId(null);
      return;
    }
    setExpandedWinnersId(campaignId);
    if (cycleWinnersCache[campaignId]) return;
    setWinnersLoading(true);
    try {
      const res = await fetch(`/api/admin?resource=challenge-cycle-winners&challengeId=${campaignId}`, { cache: "no-store" });
      const payload = (await res.json()) as { ok: boolean; items?: CycleWinnerRecord[]; error?: string };
      if (payload.ok) {
        setCycleWinnersCache((prev) => ({ ...prev, [campaignId]: payload.items ?? [] }));
      }
    } finally {
      setWinnersLoading(false);
    }
  }

  async function togglePrizePanel(campaignId: string) {
    if (expandedPrizeId === campaignId) {
      setExpandedPrizeId(null);
      return;
    }
    setExpandedPrizeId(campaignId);
    if (campaignId in finalizedPrizeCache) return;
    setPrizeLoading(true);
    try {
      const res = await fetch(`/api/admin?resource=challenge-finalized-prize&challengeId=${campaignId}`, { cache: "no-store" });
      const payload = (await res.json()) as { ok: boolean; prize?: FinalizedPrize | null; error?: string };
      if (payload.ok) {
        setFinalizedPrizeCache((prev) => ({ ...prev, [campaignId]: payload.prize ?? null }));
      }
    } finally {
      setPrizeLoading(false);
    }
  }

  // Create form state
  const [formName, setFormName] = useState("");
  const [formRules, setFormRules] = useState("");
  const [formVenueIds, setFormVenueIds] = useState<string[]>([]);
  const [formScheduleType, setFormScheduleType] = useState<"single_day" | "multi_day">("single_day");
  const [formActiveDays, setFormActiveDays] = useState<string[]>([]);
  const [formStartDate, setFormStartDate] = useState("");
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndDay, setFormEndDay] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formGameTypes, setFormGameTypes] = useState<string[]>([...GAME_TYPE_OPTIONS]);
  const [formChallengeMode, setFormChallengeMode] = useState<ChallengeMode>("progress");
  const [formLeaderboardDisplayLimit, setFormLeaderboardDisplayLimit] = useState("10");
  const [formLeaderboardTiebreaker, setFormLeaderboardTiebreaker] = useState<ChallengeLeaderboardTiebreaker>("first_to_score");
  const [formMultiplier, setFormMultiplier] = useState("1");
  const [formPointsRequired, setFormPointsRequired] = useState("100");
  const [formRecurring, setFormRecurring] = useState<CampaignRecurringType>("none");
  const [formActive, setFormActive] = useState(true);
  const [formPrizeType, setFormPrizeType] = useState<PrizeType | "none">("none");
  const [formPrizeAmount, setFormPrizeAmount] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const fetchCampaigns = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError("");
    setStatusMessage("");
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams({
        resource: "challenge-campaigns",
        includeInactive: "true",
        includeResolved: "true",
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
      });
      if (selectedVenueId !== "all") {
        params.set("venueId", selectedVenueId);
      }
      const url = `/api/admin?${params.toString()}`;
      const res = await fetch(url, { cache: "no-store" });
      const payload = (await res.json()) as {
        ok: boolean;
        items?: AdminChallengeCampaign[];
        total?: number;
        totalPages?: number;
        error?: string;
      };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load campaigns.");
      setCampaigns(payload.items ?? []);
      setTotal(payload.total ?? 0);
      setTotalPages(payload.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, [selectedVenueId]);

  useEffect(() => {
    fetchCampaigns(page);
  }, [page, fetchCampaigns]);

  useEffect(() => {
    setPage(1);
  }, [selectedVenueId]);

  // ── Selection ────────────────────────────────────────────────────────────

  const allOnPageSelected =
    campaigns.length > 0 && campaigns.every((c) => selectedIds.has(c.id));

  function toggleSelectAll() {
    setSelectedIds(allOnPageSelected ? new Set() : new Set(campaigns.map((c) => c.id)));
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────

  async function bulkPatch(isActive: boolean) {
    setBulkBusy(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch("/api/admin", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resource: "challenge-campaigns", id, isActive }),
          })
        )
      );
      setSelectedIds(new Set());
      await fetchCampaigns(page);
    } catch {
      setError("Failed to update some campaigns.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selectedIds.size} campaign(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/admin?resource=challenge-campaigns&id=${id}`, { method: "DELETE" })
        )
      );
      setSelectedIds(new Set());
      await fetchCampaigns(1);
      setPage(1);
    } catch {
      setError("Failed to delete some campaigns.");
    } finally {
      setBulkBusy(false);
    }
  }

  // ── Toggle single ────────────────────────────────────────────────────────

  async function toggleActive(campaign: AdminChallengeCampaign) {
    try {
      await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "challenge-campaigns",
          id: campaign.id,
          isActive: !campaign.isActive,
        }),
      });
      setStatusMessage(`Campaign "${campaign.name}" ${campaign.isActive ? "disabled" : "enabled"}.`);
      await fetchCampaigns(page);
    } catch {
      setError("Failed to toggle campaign.");
    }
  }

  async function deleteCampaign(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/admin?resource=challenge-campaigns&id=${id}`, { method: "DELETE" });
      setStatusMessage(`Campaign "${name}" deleted.`);
      await fetchCampaigns(page);
    } catch {
      setError("Failed to delete campaign.");
    }
  }

  // ── Reorder ──────────────────────────────────────────────────────────────

  async function moveItem(id: string, direction: "up" | "down") {
    const idx = campaigns.findIndex((c) => c.id === id);
    const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || neighborIdx < 0 || neighborIdx >= campaigns.length) return;
    const item = campaigns[idx];
    const neighbor = campaigns[neighborIdx];
    const itemOrder = item.displayOrder ?? idx * 10;
    const neighborOrder = neighbor.displayOrder ?? neighborIdx * 10;
    try {
      await Promise.all([
        fetch("/api/admin", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resource: "challenge-campaigns", id: item.id, displayOrder: neighborOrder }),
        }),
        fetch("/api/admin", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resource: "challenge-campaigns", id: neighbor.id, displayOrder: itemOrder }),
        }),
      ]);
      await fetchCampaigns(page);
    } catch {
      setError("Failed to reorder campaigns.");
    }
  }

  // ── Create ───────────────────────────────────────────────────────────────

  function resetCreateForm() {
    setFormName("");
    setFormRules("");
    setFormVenueIds([]);
    setFormScheduleType("single_day");
    setFormActiveDays([]);
    setFormStartDate("");
    setFormStartTime("");
    setFormEndDay("");
    setFormEndTime("");
    setFormEndDate("");
    setFormGameTypes([...GAME_TYPE_OPTIONS]);
    setFormChallengeMode("progress");
    setFormLeaderboardDisplayLimit("10");
    setFormLeaderboardTiebreaker("first_to_score");
    setFormMultiplier("1");
    setFormPointsRequired("100");
    setFormRecurring("none");
    setFormActive(true);
    setFormPrizeType("none");
    setFormPrizeAmount("");
    setCreateError("");
    setEditingCampaignId(null);
  }

  function beginCreate() {
    resetCreateForm();
    setStatusMessage("");
    setMode("create");
  }

  // ── Create Reward wizard wiring (Phase 5) ───────────────────────────────────
  // The wizard itself is shared with the Partner Dashboard
  // (components/rewards/CreateRewardWizard.tsx); only these two callbacks differ,
  // pointed at /api/admin instead of /api/owner/rewards.
  const fetchRewardContext = useCallback(
    async (venueId: string, definitionId: string): Promise<RewardCreationContextDTO> => {
      const res = await fetch(
        `/api/admin?resource=reward-context&venueId=${encodeURIComponent(venueId)}&definitionId=${encodeURIComponent(definitionId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json()) as { ok: boolean; context?: RewardCreationContextDTO; error?: string };
      if (!json.ok || !json.context) throw new Error(json.error ?? "Couldn't check that game's schedule.");
      return json.context;
    },
    []
  );

  const submitReward = useCallback(async (submission: CreateRewardSubmission) => {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource: "rewards", ...submission }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) return { ok: false as const, error: json.error ?? "Couldn't create that reward." };
    return { ok: true as const };
  }, []);

  function beginEdit(campaign: AdminChallengeCampaign) {
    setEditingCampaignId(campaign.id);
    setFormName(campaign.name);
    setFormRules(campaign.rules);
    setFormVenueIds(campaign.venueIds);
    const st = campaign.scheduleType;
    setFormScheduleType(st === "multi_day" || st === "one_time" ? "multi_day" : "single_day");
    setFormActiveDays(campaign.activeDays);
    setFormStartDate(campaign.startDate ?? "");
    setFormStartTime(campaign.startTime ?? "");
    setFormEndDay(campaign.endDay ?? "");
    setFormEndTime(campaign.endTime ?? "");
    setFormEndDate(campaign.endDate ?? "");
    setFormGameTypes(
      campaign.gameTypes.length > 0
        ? Array.from(new Set(campaign.gameTypes.map((gameType) => normalizeFormGameType(gameType))))
        : [...GAME_TYPE_OPTIONS]
    );
    setFormMultiplier(String(campaign.pointMultiplier ?? 1));
    setFormPointsRequired(String(campaign.pointsRequiredToWin ?? 100));
    setFormChallengeMode(campaign.challengeMode === "leaderboard" ? "leaderboard" : "progress");
    setFormLeaderboardDisplayLimit(String(campaign.leaderboardDisplayLimit ?? 10));
    setFormLeaderboardTiebreaker(
      campaign.leaderboardTiebreaker === "latest_activity" ? "latest_activity" : "first_to_score"
    );
    setFormRecurring(campaign.recurringType ?? "none");
    setFormActive(Boolean(campaign.isActive));
    setFormPrizeType(campaign.prizeType ?? "none");
    setFormPrizeAmount(campaign.prizeGiftCertificateAmount != null ? String(campaign.prizeGiftCertificateAmount) : "");
    setCreateError("");
    setStatusMessage("");
    setMode("edit");
  }

  async function handleCreateOrEdit() {
    if (!formName.trim()) { setCreateError("Name is required."); return; }
    if (!formRules.trim()) { setCreateError("Rules are required."); return; }
    setCreateBusy(true);
    setCreateError("");
    try {
      const body = {
        resource: "challenge-campaigns" as const,
        name: formName.trim(),
        rules: formRules.trim(),
        venueIds: formVenueIds,
        scheduleType: formScheduleType,
        activeDays: formScheduleType === "multi_day" ? (formRecurring !== "none" ? formActiveDays : []) : formActiveDays,
        startDate: formScheduleType === "multi_day" && formRecurring === "none" ? (formStartDate || undefined) : undefined,
        startTime: formStartTime || undefined,
        endDay: formScheduleType === "multi_day" && formRecurring !== "none" ? (formEndDay || undefined) : undefined,
        endTime: formEndTime || undefined,
        endDate: formEndDate || undefined,
        gameTypes: formGameTypes,
        challengeMode: formChallengeMode,
        leaderboardDisplayLimit: parseInt(formLeaderboardDisplayLimit, 10) || 10,
        leaderboardTiebreaker: formLeaderboardTiebreaker,
        pointMultiplier: parseFloat(formMultiplier) || 1,
        pointsRequiredToWin: parseInt(formPointsRequired, 10) || 100,
        recurringType: formRecurring,
        prizeType: formPrizeType === "none" ? null : formPrizeType,
        prizeGiftCertificateAmount:
          formPrizeType === "gift_certificate" && formPrizeAmount.trim()
            ? parseFloat(formPrizeAmount) || null
            : null,
        isActive: formActive,
      };

      const isEditing = mode === "edit" && editingCampaignId;
      const res = await fetch("/api/admin", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { ...body, id: editingCampaignId } : body),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to create campaign.");
      resetCreateForm();
      setMode("list");
      setStatusMessage(isEditing ? "Campaign updated." : "Campaign created.");
      await fetchCampaigns(1);
      setPage(1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to save campaign.");
    } finally {
      setCreateBusy(false);
    }
  }

  // ── Create Reward wizard render (Phase 5) ───────────────────────────────────
  // New rewards go through the shared wizard; editing an existing (possibly
  // legacy) campaign still uses the raw-field form below.

  if (mode === "create") {
    return (
      <div className="max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">New Reward</h2>
        </div>
        <CreateRewardWizard
          variant="admin"
          venues={venues}
          defaultVenueId={selectedVenueId !== "all" ? selectedVenueId : undefined}
          scheduleLinkHref="/admin/live-trivia"
          fetchContext={fetchRewardContext}
          onSubmit={submitReward}
          onCreated={() => {
            resetCreateForm();
            setMode("list");
            setStatusMessage("Reward created.");
            fetchCampaigns(1);
            setPage(1);
          }}
          onCancel={() => {
            resetCreateForm();
            setMode("list");
          }}
        />
      </div>
    );
  }

  // ── Edit form render ─────────────────────────────────────────────────────

  if (mode === "edit") {
    const field = adminField;
    const lbl = adminLabel;

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {mode === "edit" ? "Edit Reward" : "New Reward"}
          </h2>
          <button
            onClick={() => { resetCreateForm(); setMode("list"); }}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← Back to list
          </button>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className={lbl}>Campaign Name *</label>
            <input className={field} value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Rules *</label>
            <textarea
              className={`${field} h-24 resize-none`}
              value={formRules}
              onChange={(e) => setFormRules(e.target.value)}
            />
          </div>

          {/* Game types */}
          <div>
            <label className={lbl}>Game Types</label>
            <div className="flex flex-wrap gap-2 pt-1">
              {GAME_TYPE_OPTIONS.map((g) => (
                <label key={g} className="flex cursor-pointer items-center gap-1.5 text-sm text-black">
                  <input
                    type="checkbox"
                    checked={formGameTypes.includes(g)}
                    onChange={() =>
                      setFormGameTypes((prev) =>
                        prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  {gameTypeLabel(g)}
                </label>
              ))}
            </div>
          </div>

          {/* Schedule type toggle */}
          <div className="col-span-2">
            <label className={lbl}>Schedule Type</label>
            <div className="mt-1 flex w-fit overflow-hidden rounded-lg border border-slate-300">
              {(["single_day", "multi_day"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormScheduleType(type)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    formScheduleType === type
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {type === "multi_day" ? "Multi-Day Challenge" : "Single Day Challenge"}
                </button>
              ))}
            </div>
          </div>

          {formScheduleType === "multi_day" ? (
            <>
              {/* Multi-day: recurring cadence first — it controls which sub-fields appear */}
              <div>
                <label className={lbl}>Recurring</label>
                <select
                  className={field}
                  value={formRecurring}
                  onChange={(e) => setFormRecurring(e.target.value as CampaignRecurringType)}
                >
                  {RECURRING_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div /> {/* spacer */}

              {formRecurring === "none" ? (
                <>
                  {/* One-time: absolute start date+time → end date+time */}
                  <div>
                    <label className={lbl}>Start Date</label>
                    <input type="date" className={field} value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>Start Time</label>
                    <input type="time" className={field} value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>End Date</label>
                    <input type="date" className={field} value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>End Time</label>
                    <input type="time" className={field} value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} />
                  </div>
                  {formStartDate && formEndDate && (() => {
                    const fmtDatetime = (date: string, time: string) => {
                      const d = new Date(time ? `${date}T${time}` : `${date}T00:00`);
                      return d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                    };
                    const startMs = Date.parse(formStartTime ? `${formStartDate}T${formStartTime}` : `${formStartDate}T00:00`);
                    const endMs = Date.parse(formEndTime ? `${formEndDate}T${formEndTime}` : `${formEndDate}T23:59`);
                    const diffHrs = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
                      ? Math.round((endMs - startMs) / 36000) / 100
                      : null;
                    return (
                      <div className="col-span-2">
                        <p className="text-xs font-medium text-indigo-700">
                          Window: {fmtDatetime(formStartDate, formStartTime)} → {fmtDatetime(formEndDate, formEndTime)}
                          {diffHrs !== null ? ` · ${diffHrs} hrs` : ""}
                        </p>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <>
                  {/* Recurring multi-day: start day + time → end day + time */}
                  <div>
                    <label className={lbl}>Start Day</label>
                    <select
                      className={field}
                      value={formActiveDays[0] ?? ""}
                      onChange={(e) => setFormActiveDays(e.target.value ? [e.target.value] : [])}
                    >
                      <option value="">— select —</option>
                      {DAY_OPTIONS.map((d) => (
                        <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Start Time</label>
                    <input type="time" className={field} value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} />
                  </div>
                  <div>
                    <label className={lbl}>End Day</label>
                    <select
                      className={field}
                      value={formEndDay}
                      onChange={(e) => setFormEndDay(e.target.value)}
                    >
                      <option value="">— select —</option>
                      {DAY_OPTIONS.map((d) => (
                        <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>End Time</label>
                    <input type="time" className={field} value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} />
                  </div>
                  {formActiveDays[0] && formEndDay && formStartTime && formEndTime && (() => {
                    const DAY_FULL: Record<string, string> = {
                      sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday",
                      thu: "Thursday", fri: "Friday", sat: "Saturday",
                    };
                    const fmtTime = (t: string) =>
                      new Date(`1970-01-01T${t}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                    const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
                    const startIdx = DOW.indexOf(formActiveDays[0]);
                    const endIdx = DOW.indexOf(formEndDay);
                    const span = ((endIdx - startIdx) + 7) % 7 || 7;
                    return (
                      <div className="col-span-2">
                        <p className="text-xs font-medium text-indigo-700">
                          Window: {DAY_FULL[formActiveDays[0]]} {fmtTime(formStartTime)} → {DAY_FULL[formEndDay]} {fmtTime(formEndTime)} · {span} day{span !== 1 ? "s" : ""} each {formRecurring}
                        </p>
                      </div>
                    );
                  })()}
                  <div>
                    <label className={lbl}>Schedule Expiry Date</label>
                    <input type="date" className={field} value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} />
                    <p className="mt-1.5 text-xs text-slate-500">Optional. The recurring schedule stops after this date.</p>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* Single-day: active days + time window + recurring cadence */}
              <div>
                <label className={lbl}>Start Day(s)</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {DAY_OPTIONS.map((d) => (
                    <label key={d} className="flex cursor-pointer items-center gap-1.5 text-sm capitalize text-black">
                      <input
                        type="checkbox"
                        checked={formActiveDays.includes(d)}
                        onChange={() =>
                          setFormActiveDays((prev) =>
                            prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                      {d}
                    </label>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Select the day(s) the challenge window opens. If the end time is past midnight, the challenge closes on the following day.
                </p>
              </div>

              <div>
                <label className={lbl}>Start Time</label>
                <input type="time" className={field} value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} />
              </div>
              <div>
                <label className={lbl}>
                  End Time <span className="normal-case font-normal text-slate-400">(next day if earlier than start)</span>
                </label>
                <input type="time" className={field} value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} />
                {formStartTime && formEndTime && formActiveDays.length > 0 && (() => {
                  const fmtTime = (t: string) =>
                    new Date(`1970-01-01T${t}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                  const DAY_FULL: Record<string, string> = {
                    sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday",
                    thu: "Thursday", fri: "Friday", sat: "Saturday",
                  };
                  const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
                  const crossesMidnight = formEndTime <= formStartTime;
                  const startDayKey = formActiveDays[0];
                  const startDayLabel = formActiveDays.length > 1 ? "each selected day" : (DAY_FULL[startDayKey] ?? startDayKey);
                  const nextDayKey = DAY_ORDER[(DAY_ORDER.indexOf(startDayKey) + 1) % 7];
                  const nextDayLabel = DAY_FULL[nextDayKey] ?? nextDayKey;
                  return crossesMidnight ? (
                    <p className="mt-1.5 text-xs font-medium text-indigo-700">
                      Window: {startDayLabel} {fmtTime(formStartTime)} → {nextDayLabel} {fmtTime(formEndTime)} (crosses midnight)
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-slate-500">
                      Window: {startDayLabel} {fmtTime(formStartTime)} → {fmtTime(formEndTime)} (same day)
                    </p>
                  );
                })()}
              </div>

              <div>
                <label className={lbl}>Schedule Expiry Date</label>
                <input type="date" className={field} value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)} />
                <p className="mt-1.5 text-xs text-slate-500">Optional. The recurring schedule stops after this date.</p>
              </div>
              <div>
                <label className={lbl}>Recurring</label>
                <select
                  className={field}
                  value={formRecurring}
                  onChange={(e) => setFormRecurring(e.target.value as CampaignRecurringType)}
                >
                  {RECURRING_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className={lbl}>Challenge Type</label>
            <select
              className={field}
              value={formChallengeMode}
              onChange={(e) => setFormChallengeMode(e.target.value as ChallengeMode)}
            >
              {(formChallengeMode === "leaderboard"
                ? [...CHALLENGE_MODE_OPTIONS, "leaderboard" as ChallengeMode]
                : CHALLENGE_MODE_OPTIONS
              ).map((mode) => (
                <option key={mode} value={mode}>
                  {challengeModeLabel(mode)}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              {formChallengeMode === "leaderboard"
                ? "Legacy leaderboard reward — retired from creation. Users are ranked by eligible points earned during the window; switch to Progress Gauge to move this reward onto the current model."
                : "Users fill a progress gauge by earning eligible points. The first user to reach the points target wins immediately."}
            </p>
          </div>

          <div>
            <label className={lbl}>Point Multiplier</label>
            <input
              type="number"
              min={0.1}
              step={0.1}
              className={field}
              value={formMultiplier}
              onChange={(e) => setFormMultiplier(e.target.value)}
            />
          </div>
          {formChallengeMode === "progress" ? (
            <div>
              <label className={lbl}>Points Required to Win</label>
              <input
                type="number"
                min={1}
                className={field}
                value={formPointsRequired}
                onChange={(e) => setFormPointsRequired(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                First user to accumulate this many eligible points wins and the challenge closes immediately.
              </p>
            </div>
          ) : (
            <div>
              <label className={lbl}>Leaderboard Display Limit</label>
              <input
                type="number"
                min={1}
                max={50}
                className={field}
                value={formLeaderboardDisplayLimit}
                onChange={(e) => setFormLeaderboardDisplayLimit(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Max users shown on the leaderboard card (1–50). Players outside this range still see their own rank.
              </p>
            </div>
          )}

          {formChallengeMode === "leaderboard" && (
            <div>
              <label className={lbl}>Leaderboard Tie-breaker</label>
              <select
                className={field}
                value={formLeaderboardTiebreaker}
                onChange={(e) => setFormLeaderboardTiebreaker(e.target.value as ChallengeLeaderboardTiebreaker)}
              >
                {LEADERBOARD_TIEBREAKER_OPTIONS.map((tiebreaker) => (
                  <option key={tiebreaker} value={tiebreaker}>
                    {leaderboardTiebreakerLabel(tiebreaker)}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-500">
                {formLeaderboardTiebreaker === "latest_activity"
                  ? "Tied users are broken by who scored most recently (later activity wins)."
                  : "Tied users are broken by who reached that score first (earlier activity wins)."}
              </p>
            </div>
          )}

          {/* Prize */}
          <div className="col-span-2">
            <label className={lbl}>Prize for Winner</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {PRIZE_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setFormPrizeType(opt.value); if (opt.value !== "gift_certificate") setFormPrizeAmount(""); }}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    formPrizeType === opt.value
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {formPrizeType === "gift_certificate" && (
              <div className="mt-3">
                <label className={lbl}>Gift Certificate Amount (USD)</label>
                <div className="relative mt-1 w-40">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    placeholder="0.00"
                    className={`${field} pl-7`}
                    value={formPrizeAmount}
                    onChange={(e) => setFormPrizeAmount(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Venue targeting */}
          <div className="col-span-2">
            <label className={lbl}>Target Venues (leave empty for all venues)</label>
            <div className="mt-1 grid grid-cols-3 gap-2 rounded-lg border border-slate-200 p-3">
              {venues.map((v) => (
                <label key={v.id} className="flex cursor-pointer items-center gap-2 text-sm text-black">
                  <input
                    type="checkbox"
                    checked={formVenueIds.includes(v.id)}
                    onChange={() =>
                      setFormVenueIds((prev) =>
                        prev.includes(v.id) ? prev.filter((x) => x !== v.id) : [...prev, v.id]
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  {v.name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Active immediately
            </label>
          </div>
        </div>

        {createError && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {createError}
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleCreateOrEdit}
            disabled={createBusy}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createBusy ? "Saving…" : mode === "edit" ? "Save Campaign" : "Create Campaign"}
          </button>
          <button
            onClick={() => { resetCreateForm(); setMode("list"); }}
            disabled={createBusy}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── List render ───────────────────────────────────────────────────────────

  const venueNameById = new Map(venues.map((v) => [v.id, v.name]));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Rewards</h2>
            <p className="text-xs text-slate-500">
              {selectedVenueId === "all" ? `${total} total campaigns` : `${total} campaigns for selected venue`}
            </p>
          </div>
          <button
            onClick={beginCreate}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + New Campaign
          </button>
        </div>

        <div className="px-6 pt-4">
          <label className={adminLabel}>
            Select a Venue
          </label>
          <select
            value={selectedVenueId}
            onChange={(e) => setSelectedVenueId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          >
            <option value="all">All Venues</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>

        {/* Bulk action bar */}
        <div className="px-6 pt-4">
          <BulkActionBar
            count={selectedIds.size}
            onEnableSelected={() => bulkPatch(true)}
            onDisableSelected={() => bulkPatch(false)}
            onDeleteSelected={bulkDelete}
            onClear={() => setSelectedIds(new Set())}
            busy={bulkBusy}
          />
        </div>

        {error && (
          <div className="mx-6 mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
        )}
        {statusMessage && (
          <div className="mx-6 mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{statusMessage}</div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className={`${TH} w-10`}>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                </th>
                <th className={`${TH} w-16`}>Order</th>
                <th className={TH}>Name</th>
                <th className={TH}>Status</th>
                <th className={TH}>Games</th>
                <th className={TH}>Type</th>
                <th className={TH}>Recurring</th>
                <th className={TH}>Venues</th>
                <th className={TH}>Winner</th>
                <th className={TH}>History</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-sm text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && campaigns.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-sm text-slate-400">
                    No campaigns yet.
                  </td>
                </tr>
              )}
              {!loading &&
                campaigns.map((c) => (
                  <React.Fragment key={c.id}>
                  <tr className={TR}>
                    <td className={`${TD} w-10`}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleRow(c.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                      />
                    </td>
                    <td className={`${TD} w-16`}>
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          onClick={() => moveItem(c.id, "up")}
                          disabled={campaigns.indexOf(c) === 0}
                          className="rounded px-1 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveItem(c.id, "down")}
                          disabled={campaigns.indexOf(c) === campaigns.length - 1}
                          className="rounded px-1 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20"
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>
                    </td>
                    <td className={TD}>
                      <span className="font-medium text-slate-900">{c.name}</span>
                      <div className="text-xs text-slate-400">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className={TD}>
                      <StatusBadge isActive={c.isActive} hasWinner={Boolean(c.winnerUserId)} />
                    </td>
                    <td className={`${TD} text-slate-500`}>
                      {c.gameTypes.map((gameType) => gameTypeLabel(gameType)).join(", ")}
                    </td>
                    <td className={`${TD} text-slate-500`}>
                      {challengeModeLabel(c.challengeMode)}
                    </td>
                    <td className={`${TD} capitalize text-slate-500`}>{c.recurringType}</td>
                    <td className={`${TD} text-slate-500`}>
                      {c.venueIds.length === 0
                        ? "All venues"
                        : c.venueIds.map((id) => venueNameById.get(id) ?? id).join(", ")}
                    </td>
                    <td className={`${TD} text-slate-500`}>
                      {c.winnerUsername ?? "—"}
                    </td>
                    <td className={TD}>
                      {c.recurringType !== "none" ? (
                        <button
                          onClick={() => toggleWinnersPanel(c.id)}
                          className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                            expandedWinnersId === c.id
                              ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                              : "border-slate-200 text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          {expandedWinnersId === c.id ? "Hide" : "History"}
                        </button>
                      ) : c.winnerUserId ? (
                        <button
                          onClick={() => togglePrizePanel(c.id)}
                          className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
                            expandedPrizeId === c.id
                              ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 text-slate-500 hover:bg-slate-50"
                          }`}
                        >
                          {expandedPrizeId === c.id ? "Hide" : "Prize"}
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => beginEdit(c)}
                          className="rounded border border-indigo-200 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => toggleActive(c)}
                          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          {c.isActive ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={() => deleteCampaign(c.id, c.name)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedPrizeId === c.id && (
                    <tr key={`${c.id}-prize`}>
                      <td colSpan={11} className="border-t border-emerald-100 bg-emerald-50 px-8 py-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">Prize Status</p>
                        {prizeLoading && !(c.id in finalizedPrizeCache) ? (
                          <p className="text-xs text-slate-400">Loading…</p>
                        ) : !finalizedPrizeCache[c.id] ? (
                          <p className="text-xs text-slate-400">No prize record found.</p>
                        ) : (() => {
                          const p = finalizedPrizeCache[c.id]!;
                          const prizeLabel = p.prizeType ? p.prizeType.replace(/_/g, " ") : "No prize";
                          return (
                            <div className="flex flex-wrap gap-8 text-xs">
                              <div>
                                <p className="font-semibold text-slate-600">Winner</p>
                                <p className="text-slate-900">{p.winnerUsername ?? p.winnerUserId}</p>
                              </div>
                              <div>
                                <p className="font-semibold text-slate-600">Prize</p>
                                <p className="capitalize text-slate-900">
                                  {prizeLabel}
                                  {p.prizeGiftCertificateAmount != null ? ` · $${p.prizeGiftCertificateAmount.toFixed(2)}` : ""}
                                </p>
                              </div>
                              {p.prizeExpiresAt && (
                                <div>
                                  <p className="font-semibold text-slate-600">Expires</p>
                                  <p className="text-slate-900">
                                    {new Date(p.prizeExpiresAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                                  </p>
                                </div>
                              )}
                              <div>
                                <p className="font-semibold text-slate-600">Redeemed</p>
                                {p.prizeRedeemedAt ? (
                                  <p className="text-emerald-700">
                                    {new Date(p.prizeRedeemedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                                  </p>
                                ) : p.prizeType ? (
                                  <p className="text-amber-600">Pending</p>
                                ) : (
                                  <p className="text-slate-400">n/a</p>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  )}
                  {expandedWinnersId === c.id && (
                    <tr key={`${c.id}-winners`}>
                      <td colSpan={11} className="border-t border-indigo-100 bg-indigo-50 px-8 py-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">Past Cycle Winners</p>
                        {winnersLoading && !cycleWinnersCache[c.id] ? (
                          <p className="text-xs text-slate-400">Loading…</p>
                        ) : (cycleWinnersCache[c.id] ?? []).length === 0 ? (
                          <p className="text-xs text-slate-400">No cycle winners recorded yet.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-slate-500">
                                <th className="pb-1 pr-6 font-semibold">Week of</th>
                                <th className="pb-1 pr-6 font-semibold">Winner</th>
                                <th className="pb-1 pr-6 font-semibold">Points</th>
                                <th className="pb-1 pr-6 font-semibold">Prize</th>
                                <th className="pb-1 font-semibold">Redeemed</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(cycleWinnersCache[c.id] ?? []).map((w) => (
                                <tr key={w.id} className="border-t border-indigo-100">
                                  <td className="py-1 pr-6 text-slate-700">
                                    {new Date(w.cycleStart).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                                  </td>
                                  <td className="py-1 pr-6 font-medium text-slate-900">{w.winnerUsername ?? w.winnerUserId}</td>
                                  <td className="py-1 pr-6 text-slate-700">{w.pointsEarned}</td>
                                  <td className="py-1 pr-6 capitalize text-slate-700">
                                    {w.prizeType ? w.prizeType.replace(/_/g, " ") : "—"}
                                  </td>
                                  <td className="py-1">
                                    {w.prizeType == null ? (
                                      <span className="text-slate-400">n/a</span>
                                    ) : w.prizeRedeemedAt ? (
                                      <span className="text-emerald-700">
                                        {new Date(w.prizeRedeemedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                                      </span>
                                    ) : (
                                      <span className="text-amber-600">Pending</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => setPage(p)}
          />
        )}
      </div>
    </div>
  );
}
