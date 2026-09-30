"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { DashboardNotice } from "@/components/owner/dashboard/DashboardNotice";
import { DashboardToast } from "@/components/owner/dashboard/DashboardToast";
import { HIGHLIGHT_MS } from "@/components/owner/dashboard/useHighlightRing";
import { SectionSkeleton } from "@/components/owner/dashboard/DashboardSectionCard";
import { LiveGamesSection, type SectionLoad } from "@/components/owner/dashboard/LiveGamesSection";
import { RewardsSection } from "@/components/owner/dashboard/RewardsSection";
import { RewardsFlow, type RewardsChange } from "@/components/owner/rewards/RewardsFlow";
import { ScheduleGameFlow, type ScheduleChange } from "@/components/owner/schedule/ScheduleGameFlow";
import { Dropdown } from "@/components/ui/Dropdown";
import { ownerAuthRecoveryPath } from "@/lib/ownerAuthCodes";
import { knownItemIds, resolvePendingHighlight, type PendingHighlight } from "@/lib/ownerDashboardHighlight";
import type { OwnerCompetition } from "@/lib/ownerRewardDisplay";
import { useOwnerSheet } from "@/lib/useOwnerSheet";
import type { OwnerSchedule } from "@/types";

type Venue = {
  id: string;
  name: string;
};

/** The confirmation toast; `offerReward` adds "Now offer a reward for it →". `id` remounts it (fresh timer) per change. */
type ToastState = { id: number; message: string; offerReward: boolean };

/** A row to ring once its list refetches (see lib/ownerDashboardHighlight.ts). */
type PendingRing =
  | ({ list: "games" } & PendingHighlight<SectionLoad<OwnerSchedule>>)
  | ({ list: "rewards" } & PendingHighlight<SectionLoad<OwnerCompetition>>);

type ListResult<T> = { ok: true; items: T[] } | { ok: false; message: string };

/** GET a list endpoint, or hand a 401 to `onUnauthorized` (returns `null` = redirecting). */
const fetchList = async <T,>(
  url: string,
  pick: (json: unknown) => T[] | undefined,
  fallbackMessage: string,
  onUnauthorized: (code?: string) => void,
): Promise<ListResult<T> | null> => {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 401) {
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      onUnauthorized(body.code);
      return null;
    }
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) return { ok: false, message: json.error ?? fallbackMessage };
    return { ok: true, items: pick(json) ?? [] };
  } catch {
    return { ok: false, message: fallbackMessage };
  }
};


// Keyed by venue at the call site: switching venues remounts it with fresh loading state.
const DashboardBody = ({ venueId, venueName }: { venueId: string; venueName: string }) => {
  const router = useRouter();
  const sheet = useOwnerSheet();
  const [games, setGames] = useState<SectionLoad<OwnerSchedule>>({ status: "loading" });
  // "Now" for upcoming-vs-past bucketing, stamped when the games list arrives.
  const [gamesAsOfMs, setGamesAsOfMs] = useState(0);
  const [rewards, setRewards] = useState<SectionLoad<OwnerCompetition>>({ status: "loading" });
  // What the last save/cancel told the partner: a self-clearing toast, plus the server's
  // advisory about pinned rewards (persistent, because it explains a side effect).
  const [toast, setToast] = useState<ToastState | null>(null);
  const [advisory, setAdvisory] = useState<string | null>(null);
  // Each open of the schedule sheet mounts a fresh flow (a new `key`) so it never
  // inherits the last game's answers; `scheduleTarget` is the game that was tapped.
  const [scheduleSession, setScheduleSession] = useState(0);
  const [scheduleTarget, setScheduleTarget] = useState<OwnerSchedule | null>(null);
  // Same for the rewards sheet; `rewardsTarget` is the reward that was tapped.
  const [rewardsSession, setRewardsSession] = useState(0);
  const [rewardsTarget, setRewardsTarget] = useState<OwnerCompetition | null>(null);
  // The schedule sheet was opened from the wizard's "Schedule Live Trivia": once a game is saved, offer to continue the reward.
  const [scheduleForReward, setScheduleForReward] = useState(false);
  // The row just saved gets a ring for HIGHLIGHT_MS; `pendingHighlight` waits for the refetch that contains it.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<PendingRing | null>(null);

  const onUnauthorized = useCallback(
    (code?: string) => router.push(ownerAuthRecoveryPath(code)),
    [router],
  );

  // Bumped by Retry to re-run that section's effect.
  const [gamesAttempt, setGamesAttempt] = useState(0);
  const [rewardsAttempt, setRewardsAttempt] = useState(0);

  // The two lists load in parallel (separate effects), once per venue.
  useEffect(() => {
    let cancelled = false;
    // No gameType -> merged calendar across both engines (Category Blitz + Live Trivia).
    void fetchList<OwnerSchedule>(
      `/api/owner/schedule?venueId=${encodeURIComponent(venueId)}`,
      (json) => (json as { schedules?: OwnerSchedule[] }).schedules,
      "Couldn't load your games.",
      onUnauthorized,
    ).then((result) => {
      if (cancelled || !result) return;
      setGamesAsOfMs(Date.now());
      setGames(result.ok ? { status: "ready", items: result.items } : { status: "error", message: result.message });
    });
    return () => {
      cancelled = true;
    };
  }, [venueId, gamesAttempt, onUnauthorized]);

  useEffect(() => {
    let cancelled = false;
    void fetchList<OwnerCompetition>(
      `/api/owner/competitions?venueId=${encodeURIComponent(venueId)}`,
      (json) => (json as { competitions?: OwnerCompetition[] }).competitions,
      "Couldn't load your rewards.",
      onUnauthorized,
    ).then((result) => {
      if (cancelled || !result) return;
      setRewards(result.ok ? { status: "ready", items: result.items } : { status: "error", message: result.message });
    });
    return () => {
      cancelled = true;
    };
  }, [venueId, rewardsAttempt, onUnauthorized]);

  // Adjust-during-render (react-hooks/set-state-in-effect): the first refetched list after a
  // change resolves which row to ring.
  if (pendingHighlight) {
    const resolution =
      pendingHighlight.list === "games"
        ? resolvePendingHighlight(pendingHighlight, games)
        : resolvePendingHighlight(pendingHighlight, rewards);
    if (resolution.resolved) {
      setPendingHighlight(null);
      setHighlightId(resolution.id);
    }
  }

  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const dismissToast = useCallback(() => setToast(null), []);

  const openSchedule = (target?: OwnerSchedule | "all", forReward = false) => {
    setScheduleSession((n) => n + 1);
    setScheduleTarget(target && target !== "all" ? target : null);
    setScheduleForReward(forReward);
    sheet.openSheet("schedule", target === "all" ? "all" : target ? "detail" : null);
  };

  // "new" goes straight to the wizard, "all" to the list, a reward to its detail screen.
  const openRewards = (target: OwnerCompetition | "all" | "new") => {
    setRewardsSession((n) => n + 1);
    setRewardsTarget(target === "all" || target === "new" ? null : target);
    sheet.openSheet("rewards", target === "new" ? "definition" : target === "all" ? null : "detail");
  };

  // A game was saved or cancelled: show the result and refetch. The list keeps its
  // current rows until the new ones arrive (no skeleton flash).
  const handleScheduleChanged = (change: ScheduleChange) => {
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, message: change.message, offerReward: scheduleForReward }));
    setAdvisory(change.rewardNotice);
    // A cancel removes a row; a save adds or edits one, and that row gets the ring.
    setPendingHighlight(
      change.removed ? null : { list: "games", baseline: games, knownIds: knownItemIds(games), id: change.scheduleId ?? null },
    );
    setGamesAttempt((n) => n + 1);
  };

  // A reward was created or removed: show the result and refetch its list.
  const handleRewardsChanged = (change: RewardsChange) => {
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, message: change.message, offerReward: false }));
    setAdvisory(null);
    setPendingHighlight(
      change.removed ? null : { list: "rewards", baseline: rewards, knownIds: knownItemIds(rewards), id: null },
    );
    setRewardsAttempt((n) => n + 1);
  };

  return (
    <div className="space-y-4">
      {advisory ? (
        <DashboardNotice
          tone="advisory"
          action={{ label: "View Rewards", onClick: () => openRewards("all") }}
          onDismiss={() => setAdvisory(null)}
        >
          {advisory}
        </DashboardNotice>
      ) : null}
      <LiveGamesSection
        load={games}
        nowMs={gamesAsOfMs}
        highlightId={highlightId}
        onAdd={() => openSchedule()}
        onOpen={(schedule) => openSchedule(schedule ?? "all")}
        onRetry={() => {
          setGames({ status: "loading" });
          setGamesAttempt((n) => n + 1);
        }}
      />
      <RewardsSection
        load={rewards}
        highlightId={highlightId}
        onAdd={() => openRewards("new")}
        onOpen={(reward) => openRewards(reward ?? "all")}
        onRetry={() => {
          setRewards({ status: "loading" });
          setRewardsAttempt((n) => n + 1);
        }}
      />

      {toast ? (
        <DashboardToast
          key={toast.id}
          action={
            toast.offerReward
              ? {
                  label: "Now offer a reward for it →",
                  onClick: () => {
                    setToast(null);
                    openRewards("new");
                  },
                }
              : undefined
          }
          onDismiss={dismissToast}
        >
          {toast.message}
        </DashboardToast>
      ) : null}

      <ScheduleGameFlow
        key={`schedule-${scheduleSession}`}
        venueId={venueId}
        nav={sheet}
        games={games}
        nowMs={gamesAsOfMs}
        initialSchedule={scheduleTarget}
        onChanged={handleScheduleChanged}
      />

      <RewardsFlow
        key={`rewards-${rewardsSession}`}
        venueId={venueId}
        venueName={venueName}
        nav={sheet}
        rewards={rewards}
        initialReward={rewardsTarget}
        onChanged={handleRewardsChanged}
        onRequestSchedule={() => openSchedule(undefined, true)}
      />
    </div>
  );
};

const OwnerDashboardPage = () => {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const venuesRes = await fetch("/api/owner/venues");

        if (venuesRes.status === 401) {
          const body = (await venuesRes.json().catch(() => ({}))) as { code?: string };
          router.push(ownerAuthRecoveryPath(body.code));
          return;
        }

        const venuesData = (await venuesRes.json()) as { ok: boolean; venues?: Venue[] };
        const loadedVenues = venuesData.venues ?? [];
        setVenues(loadedVenues);
        setSelectedVenueId((prev) => prev || loadedVenues[0]?.id || "");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const selectedVenue = useMemo(() => venues.find((v) => v.id === selectedVenueId), [venues, selectedVenueId]);

  // Bar centre: the venue name; with 2+ venues it is the switcher.
  const venueSwitcher = selectedVenue ? (
    venues.length > 1 ? (
      <Dropdown
        value={selectedVenueId}
        onChange={setSelectedVenueId}
        options={venues.map((v) => ({ value: v.id, label: v.name }))}
        ariaLabel="Select venue"
        className="flex min-h-10 min-w-0 max-w-full items-center gap-1.5 rounded-xl px-2 text-left"
        renderTrigger={(_selected, isOpen) => (
          <>
            <span className="truncate text-base font-black text-ht-primary">{selectedVenue.name}</span>
            <span
              className={`shrink-0 text-ht-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▾
            </span>
          </>
        )}
      />
    ) : (
      <span className="truncate text-base font-black text-ht-primary">{selectedVenue.name}</span>
    )
  ) : null;

  return (
    <OwnerShell
      title="Partner Dashboard"
      maxWidth="lg"
      variant="dark"
      barCenter={venueSwitcher}
    >
      {loading ? (
        <div className="space-y-4">
          <SectionSkeleton label="Loading dashboard" />
          <SectionSkeleton label="Loading dashboard" />
        </div>
      ) : !selectedVenueId ? (
        <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
          <p className="text-sm font-semibold text-ht-muted">No venue found for this account.</p>
        </div>
      ) : (
        <Suspense fallback={<SectionSkeleton label="Loading dashboard" />}>
          <DashboardBody key={selectedVenueId} venueId={selectedVenueId} venueName={selectedVenue?.name ?? "This venue"} />
        </Suspense>
      )}
    </OwnerShell>
  );
};

export default OwnerDashboardPage;
