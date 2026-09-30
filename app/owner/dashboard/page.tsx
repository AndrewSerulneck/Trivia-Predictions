"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { DashboardNotice } from "@/components/owner/dashboard/DashboardNotice";
import { SectionSkeleton } from "@/components/owner/dashboard/DashboardSectionCard";
import { LiveGamesSection, type SectionLoad } from "@/components/owner/dashboard/LiveGamesSection";
import { RewardsSection } from "@/components/owner/dashboard/RewardsSection";
import { ScheduleGameFlow, type ScheduleChange } from "@/components/owner/schedule/ScheduleGameFlow";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { Dropdown } from "@/components/ui/Dropdown";
import { ownerAuthRecoveryPath } from "@/lib/ownerAuthCodes";
import type { OwnerCompetition } from "@/lib/ownerRewardDisplay";
import { useOwnerSheet } from "@/lib/useOwnerSheet";
import type { OwnerSchedule } from "@/types";

type Venue = {
  id: string;
  name: string;
};

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
const DashboardBody = ({ venueId }: { venueId: string }) => {
  const router = useRouter();
  const sheet = useOwnerSheet();
  const [games, setGames] = useState<SectionLoad<OwnerSchedule>>({ status: "loading" });
  // "Now" for upcoming-vs-past bucketing, stamped when the games list arrives.
  const [gamesAsOfMs, setGamesAsOfMs] = useState(0);
  const [rewards, setRewards] = useState<SectionLoad<OwnerCompetition>>({ status: "loading" });
  // What the last save/cancel told the partner, shown above the cards until dismissed.
  const [notice, setNotice] = useState<ScheduleChange | null>(null);
  // Each open of the schedule sheet mounts a fresh flow (a new `key`) so it never
  // inherits the last game's answers; `scheduleTarget` is the game that was tapped.
  const [scheduleSession, setScheduleSession] = useState(0);
  const [scheduleTarget, setScheduleTarget] = useState<OwnerSchedule | null>(null);

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

  const openSchedule = (target?: OwnerSchedule | "all") => {
    setScheduleSession((n) => n + 1);
    setScheduleTarget(target && target !== "all" ? target : null);
    sheet.openSheet("schedule", target === "all" ? "all" : target ? "detail" : null);
  };

  // A game was saved or cancelled: show the result and refetch. The list keeps its
  // current rows until the new ones arrive (no skeleton flash).
  const handleScheduleChanged = (change: ScheduleChange) => {
    setNotice(change);
    setGamesAttempt((n) => n + 1);
  };

  return (
    <div className="space-y-4">
      {notice ? (
        <div className="space-y-2">
          <DashboardNotice tone="success" onDismiss={() => setNotice(null)}>
            {notice.message}
          </DashboardNotice>
          {notice.rewardNotice ? (
            <DashboardNotice
              tone="advisory"
              action={{ label: "View Rewards", onClick: () => sheet.openSheet("rewards") }}
              onDismiss={() => setNotice(null)}
            >
              {notice.rewardNotice}
            </DashboardNotice>
          ) : null}
        </div>
      ) : null}
      <LiveGamesSection
        load={games}
        nowMs={gamesAsOfMs}
        onAdd={() => openSchedule()}
        onOpen={(schedule) => openSchedule(schedule ?? "all")}
        onRetry={() => {
          setGames({ status: "loading" });
          setGamesAttempt((n) => n + 1);
        }}
      />
      <RewardsSection
        load={rewards}
        onAdd={() => sheet.openSheet("rewards")}
        onOpen={() => sheet.openSheet("rewards")}
        onRetry={() => {
          setRewards({ status: "loading" });
          setRewardsAttempt((n) => n + 1);
        }}
      />

      <ScheduleGameFlow
        key={scheduleSession}
        venueId={venueId}
        nav={sheet}
        games={games}
        nowMs={gamesAsOfMs}
        initialSchedule={scheduleTarget}
        onChanged={handleScheduleChanged}
      />

      {/* Placeholder sheet: Phase 5 replaces the body with the rewards flow. */}
      <OwnerSheet open={sheet.sheet === "rewards"} onRequestClose={sheet.closeSheet} title="Offer a reward">
        <p className="text-sm font-semibold text-ht-muted">Coming soon.</p>
      </OwnerSheet>
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
          <DashboardBody key={selectedVenueId} venueId={selectedVenueId} />
        </Suspense>
      )}
    </OwnerShell>
  );
};

export default OwnerDashboardPage;
