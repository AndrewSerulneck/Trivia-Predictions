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

const OwnerCompetitionsPage = () => {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "End this competition now? If it's mid-run, no winner will be recorded for this cycle — this can't be undone.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/owner/competitions/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Couldn't end that competition.");
      await fetchCompetitions();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't end that competition.");
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
              onDelete={(id) => void handleDelete(id)}
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
    </OwnerShell>
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
