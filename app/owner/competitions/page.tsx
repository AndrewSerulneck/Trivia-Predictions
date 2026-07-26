"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { Dropdown } from "@/components/ui/Dropdown";
import {
  CreateRewardWizard,
  type CreateRewardSubmission,
  type RewardCreationContextDTO,
} from "@/components/rewards/CreateRewardWizard";
import { OWNER_COMPETITION_TEMPLATES } from "@/lib/ownerCompetitionTemplates";
import { getRewardDefinition } from "@/lib/rewardDefinitions";
import { periodForCadence, renderTermsSentence } from "@/lib/rewardTerms";
import { describeCampaignGameWinnerTerms } from "@/lib/rewardGameSlots";
import type { ChallengeCampaign, ChallengeLeaderboardEntry } from "@/types";

type Venue = { id: string; name: string };
type Competition = ChallengeCampaign & { progressPoints: number };

const TEMPLATE_GLYPH: Record<string, string> = {
  pickem_race: "🏈",
  prop_bingo_night: "🎯",
  fantasy_night: "🏆",
  trivia_gauntlet: "🧠",
  house_party: "🎉",
};

// Rewards (Phase 4+) stamp rewardDefinitionId directly — glyph comes straight
// from the registry. Pre-Rewards owner Competitions never set that column
// (templates were expanded at creation, not kept as a FK), so those fall back to
// matching gameTypes + challengeMode against the retired OWNER_COMPETITION_TEMPLATES
// registry, and anything unmatched gets a generic trophy.
function glyphForCompetition(competition: Competition): string {
  if (competition.rewardDefinitionId) {
    return getRewardDefinition(competition.rewardDefinitionId)?.glyph ?? "🏆";
  }
  const sortedTypes = [...competition.gameTypes].sort().join(",");
  const match = OWNER_COMPETITION_TEMPLATES.find(
    (t) => [...t.gameTypes].sort().join(",") === sortedTypes && t.challengeMode === competition.challengeMode,
  );
  return match ? (TEMPLATE_GLYPH[match.id] ?? "🏆") : "🏆";
}

const formatDateLabel = (isoDate: string | undefined, timeZone: string): string => {
  if (!isoDate) return "—";
  try {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });
  } catch {
    return isoDate;
  }
};

const formatTimeLabel = (time: string | undefined): string => {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")}${period}`;
};

/** Prize counts for the remove dialog — mirrors ChallengeCampaignRedemptionCounts. */
type RedemptionCounts = { awarded: number; unredeemed: number; redeemed: number };

/** The reward the remove dialog is open for. `counts: null` = still loading them. */
type RemovingState = {
  id: string;
  name: string;
  counts: RedemptionCounts | null;
  busy: boolean;
};

const OwnerCompetitionsPage = () => {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [removing, setRemoving] = useState<RemovingState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/owner/venues");
        if (res.status === 401) {
          router.push("/owner/login");
          return;
        }
        const json = (await res.json()) as { ok: boolean; venues?: Venue[] };
        const loaded = json.venues ?? [];
        setVenues(loaded);
        setSelectedVenueId((prev) => prev || loaded[0]?.id || "");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const fetchCompetitions = useCallback(async () => {
    if (!selectedVenueId) {
      setCompetitions([]);
      return;
    }
    setLoadError(null);
    try {
      const res = await fetch(`/api/owner/competitions?venueId=${encodeURIComponent(selectedVenueId)}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        router.push("/owner/login");
        return;
      }
      const json = (await res.json()) as { ok: boolean; competitions?: Competition[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to load competitions.");
      setCompetitions(json.competitions ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load competitions.");
    }
  }, [selectedVenueId, router]);

  useEffect(() => {
    void fetchCompetitions();
  }, [fetchCompetitions]);

  const active = useMemo(() => competitions.filter((c) => c.isActive && !c.winnerUserId), [competitions]);
  const ended = useMemo(() => competitions.filter((c) => !c.isActive || c.winnerUserId), [competitions]);
  const selectedVenue = venues.find((v) => v.id === selectedVenueId);

  const fetchRewardContext = useCallback(
    async (venueId: string, definitionId: string): Promise<RewardCreationContextDTO> => {
      const res = await fetch(
        `/api/owner/rewards/context?venueId=${encodeURIComponent(venueId)}&definitionId=${encodeURIComponent(definitionId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { ok: boolean; context?: RewardCreationContextDTO; error?: string };
      if (!json.ok || !json.context) throw new Error(json.error ?? "Couldn't check that game's schedule.");
      return json.context;
    },
    [],
  );

  const submitReward = useCallback(async (submission: CreateRewardSubmission) => {
    const res = await fetch("/api/owner/rewards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) return { ok: false as const, error: json.error ?? "Couldn't create that reward." };
    return { ok: true as const };
  }, []);

  /**
   * Open the remove dialog, having first read how many prizes this reward has
   * paid out. The counts are what make the choice informed — "delete anyway" is
   * only a fair option if the partner can see what it costs.
   */
  const handleDeleteRequest = async (id: string) => {
    const competition = competitions.find((c) => c.id === id);
    setRemoving({ id, name: competition?.name ?? "this reward", counts: null, busy: false });
    try {
      const res = await fetch(`/api/owner/competitions/${id}`, { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        counts?: RedemptionCounts;
        error?: string;
      };
      if (!json.ok || !json.counts) throw new Error(json.error ?? "Couldn't check this reward's prizes.");
      setRemoving((prev) => (prev && prev.id === id ? { ...prev, counts: json.counts! } : prev));
    } catch (error) {
      setRemoving(null);
      setLoadError(error instanceof Error ? error.message : "Couldn't check this reward's prizes.");
    }
  };

  const performRemove = async (id: string, mode: "archive" | "delete") => {
    setRemoving((prev) => (prev && prev.id === id ? { ...prev, busy: true } : prev));
    try {
      const res = await fetch(`/api/owner/competitions/${id}?mode=${mode}`, { method: "DELETE" });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        outcome?: "archived" | "deleted";
        redeemedKept?: number;
      };
      if (!json.ok) throw new Error(json.error ?? "Couldn't remove that reward.");
      setRemoving(null);
      // Report what actually happened rather than assuming the request's mode.
      setStatusMessage(
        json.outcome === "deleted"
          ? json.redeemedKept
            ? `Reward deleted. ${json.redeemedKept} already-redeemed ${json.redeemedKept === 1 ? "prize" : "prizes"} kept for your records.`
            : "Reward deleted."
          : "Reward archived. Prizes already awarded still work.",
      );
      await fetchCompetitions();
    } catch (error) {
      setRemoving((prev) => (prev && prev.id === id ? { ...prev, busy: false } : prev));
      setLoadError(error instanceof Error ? error.message : "Couldn't remove that reward.");
    }
  };

  return (
    <OwnerShell title="Rewards" subtitle="Loyalty challenges and prizes for your guests" maxWidth="lg" variant="dark">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/owner/dashboard"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ht-exit-border bg-gradient-to-br from-ht-exit-from via-ht-exit-via to-ht-exit-to px-4 text-sm font-black text-ht-exit-text"
          >
            ← Dashboard
          </Link>

          {venues.length > 1 ? (
            <Dropdown
              value={selectedVenueId}
              onChange={(next) => {
                setSelectedVenueId(next);
                setShowForm(false);
              }}
              options={venues.map((v) => ({ value: v.id, label: v.name }))}
              ariaLabel="Select venue"
              size="sm"
              className="min-h-11 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
            />
          ) : null}
        </div>

        {loading ? (
          <p className="text-center text-sm font-semibold text-ht-muted">Loading…</p>
        ) : !selectedVenueId ? (
          <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
            <p className="text-sm font-semibold text-ht-muted">No venue found for this account.</p>
          </div>
        ) : (
          <>
            {loadError ? (
              <div className="rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-xs font-bold text-ht-rose-300">
                {loadError}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="flex items-start gap-2 rounded-xl border border-ht-cyan-500/30 bg-ht-cyan-500/10 px-3 py-2 text-xs font-bold text-ht-cyan-300">
                <span className="min-w-0 flex-1">{statusMessage}</span>
                <button
                  type="button"
                  onClick={() => setStatusMessage(null)}
                  aria-label="Dismiss"
                  className="shrink-0 px-1 font-black"
                >
                  ×
                </button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition active:translate-y-px"
            >
              {showForm ? "Cancel" : "+ Create Reward"}
            </button>

            {showForm ? (
              <CreateRewardWizard
                variant="owner"
                venues={[{ id: selectedVenueId, name: selectedVenue?.name ?? "This venue" }]}
                defaultVenueId={selectedVenueId}
                scheduleLinkHref="/owner/schedule"
                fetchContext={fetchRewardContext}
                onSubmit={submitReward}
                onCreated={() => {
                  setShowForm(false);
                  void fetchCompetitions();
                }}
                onCancel={() => setShowForm(false)}
              />
            ) : null}

            <CompetitionList
              title="Active & upcoming"
              competitions={active}
              onDelete={(id) => void handleDeleteRequest(id)}
            />

            {active.length === 0 && !showForm ? (
              <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ht-game-pickem text-2xl">
                  🏆
                </div>
                <p className="ht-h2 mt-4">No rewards running</p>
                <p className="mt-2 text-sm font-semibold text-ht-muted">
                  Create a Live Trivia Challenge for {selectedVenue?.name ?? "your venue"} — pick a prize and a
                  quantity, and it&apos;ll appear here.
                </p>
              </div>
            ) : null}

            {ended.length > 0 ? <CompetitionList title="Ended" competitions={ended} onDelete={null} dimmed /> : null}
          </>
        )}
      </div>

      {removing ? (
        <RemoveRewardDialog
          state={removing}
          onArchive={() => void performRemove(removing.id, "archive")}
          onDelete={() => void performRemove(removing.id, "delete")}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </OwnerShell>
  );
};

/**
 * The remove-reward choice. Archiving and deleting are genuinely different
 * outcomes for prizes players are holding, so both are offered explicitly with
 * the cost of each spelled out — rather than a single "are you sure?" that
 * silently picks one. Archive is listed first and styled as the primary action
 * because it is the recoverable one; deleting is available, just never the
 * accidental path.
 */
const RemoveRewardDialog = ({
  state,
  onArchive,
  onDelete,
  onCancel,
}: {
  state: RemovingState;
  onArchive: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) => {
  const counts = state.counts;
  const loading = counts === null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Remove ${state.name}`}
        className="w-full max-w-md space-y-4 rounded-2xl border border-ht-hairline bg-ht-surface p-5 shadow-ht-card"
      >
        <div>
          <p className="ht-h2">Remove &ldquo;{state.name}&rdquo;?</p>
          {loading ? (
            <p className="mt-2 text-sm font-semibold text-ht-muted">Checking prizes…</p>
          ) : counts.awarded === 0 ? (
            <p className="mt-2 text-sm font-semibold text-ht-muted">
              No prizes have been awarded from this reward yet, so nothing players hold is
              affected.
            </p>
          ) : (
            <p className="mt-2 text-sm font-semibold text-ht-muted">
              This reward has awarded{" "}
              <span className="font-black text-ht-primary">{counts.awarded}</span>{" "}
              {counts.awarded === 1 ? "prize" : "prizes"}
              {counts.unredeemed > 0 ? (
                <>
                  , and{" "}
                  <span className="font-black text-ht-amber-300">{counts.unredeemed}</span>{" "}
                  {counts.unredeemed === 1 ? "is" : "are"} still unredeemed in{" "}
                  {counts.unredeemed === 1 ? "a player's" : "players'"} wallet
                  {counts.unredeemed === 1 ? "" : "s"}.
                </>
              ) : (
                ", all of which have already been redeemed."
              )}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onArchive}
            disabled={loading || state.busy}
            className="w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition active:translate-y-px disabled:opacity-60"
          >
            Archive — stop it, keep prizes
          </button>
          <p className="px-1 text-[11px] font-semibold text-ht-muted">
            The reward stops running. Every prize already awarded still works.
          </p>

          <button
            type="button"
            onClick={onDelete}
            disabled={loading || state.busy}
            className="mt-3 w-full rounded-xl border border-ht-rose-500/40 bg-ht-rose-500/10 px-4 py-3 text-sm font-black text-ht-rose-300 transition active:translate-y-px disabled:opacity-60"
          >
            Delete anyway
          </button>
          <p className="px-1 text-[11px] font-semibold text-ht-muted">
            {loading || !counts || counts.unredeemed === 0
              ? "Removes the reward for good. Prizes already redeemed stay in your records."
              : `Removes the reward for good and voids ${counts.unredeemed} unredeemed ${counts.unredeemed === 1 ? "prize" : "prizes"}. Prizes already redeemed stay in your records.`}
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={state.busy}
          className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-4 py-2.5 text-sm font-bold text-ht-primary disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

function CompetitionList({
  title,
  competitions,
  onDelete,
  dimmed,
}: {
  title: string;
  competitions: Competition[];
  onDelete: ((id: string) => void) | null;
  dimmed?: boolean;
}) {
  if (competitions.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">{title}</p>
      {competitions.map((competition) => {
        const timezone = "America/New_York"; // display-only fallback; the engine stores naive local strings
        const topEntries: ChallengeLeaderboardEntry[] = competition.leaderboard?.topEntries ?? [];

        return (
          <div
            key={competition.id}
            className={`rounded-[14px] border border-ht-hairline bg-ht-surface p-3 shadow-ht-card ${dimmed ? "opacity-70" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ht-game-pickem text-lg">
                {glyphForCompetition(competition)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-black text-ht-primary">{competition.name}</div>
                <div className="mt-0.5 text-xs font-semibold text-ht-muted">
                  {formatDateLabel(competition.startDate, timezone)} {formatTimeLabel(competition.startTime)} –{" "}
                  {formatDateLabel(competition.endDate, timezone)} {formatTimeLabel(competition.endTime)}
                </div>
                <div className="mt-1.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider ${
                      dimmed ? "bg-ht-elevated text-ht-muted" : "bg-ht-cyan-500/15 text-ht-cyan-300"
                    }`}
                  >
                    {competition.challengeMode === "progress" ? "Progress" : "Leaderboard"}
                  </span>
                </div>
                {/* Rewards (rewardDefinitionId set) restate the exact terms the partner
                    agreed to at creation — the only place they can review it afterward,
                    since the wizard's sentence/picker only exists during creation itself.
                    A slot-pinned game-winner reward (gameWinnerSlots set) restates the
                    actual games it's pinned to instead of a period, built from the
                    campaign's own gameWinnerSlots/winnerQuota — no live-schedule fetch needed. */}
                {competition.rewardDefinitionId ? (
                  <p className="mt-1.5 text-xs font-semibold text-ht-muted">
                    {competition.winCondition === "game_winner" && competition.gameWinnerSlots
                      ? describeCampaignGameWinnerTerms(competition)
                      : renderTermsSentence(
                          competition.winnerQuota,
                          periodForCadence(competition.recurringType),
                          competition.winCondition,
                        )}
                  </p>
                ) : null}
              </div>
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(competition.id)}
                  className="shrink-0 rounded-lg border border-ht-rose-500/30 bg-ht-rose-500/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-ht-rose-300"
                >
                  End
                </button>
              ) : null}
            </div>

            {dimmed && competition.winnerUsername ? (
              <div className="mt-3 rounded-xl bg-ht-emerald-500/10 px-3 py-2 text-xs font-bold text-ht-emerald-300">
                🏆 Winner: {competition.winnerUsername}
              </div>
            ) : null}

            {!dimmed && topEntries.length > 0 ? (
              <div className="mt-3 space-y-1 border-t border-ht-hairline pt-3">
                {topEntries.slice(0, 3).map((entry) => (
                  <div key={entry.userId} className="flex items-center justify-between text-xs">
                    <span className="font-bold text-ht-secondary">
                      #{entry.rank} {entry.username}
                    </span>
                    <span className="font-black text-ht-primary">{entry.points} pts</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default OwnerCompetitionsPage;
