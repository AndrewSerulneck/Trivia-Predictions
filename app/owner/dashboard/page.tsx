"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { DashboardNotice } from "@/components/owner/dashboard/DashboardNotice";
import { DashboardToast } from "@/components/owner/dashboard/DashboardToast";
import { HIGHLIGHT_MS } from "@/components/owner/dashboard/useHighlightRing";
import { LiveGamesSection, type SectionLoad } from "@/components/owner/dashboard/LiveGamesSection";
import { RewardsSection } from "@/components/owner/dashboard/RewardsSection";
import { RewardsFlow, type RewardsChange } from "@/components/owner/rewards/RewardsFlow";
import { ScheduleGameFlow, type ScheduleChange } from "@/components/owner/schedule/ScheduleGameFlow";
import { MerchStoreSheet } from "@/components/owner/store/MerchStoreSheet";
import { Dropdown } from "@/components/ui/Dropdown";
import { HightopLoader } from "@/components/ui/HightopLoader";
import { ownerAuthRecoveryPath } from "@/lib/ownerAuthCodes";
import type { MerchCart, MerchVenueRef } from "@/lib/merchPricing";
import { knownItemIds, resolvePendingHighlight, type PendingHighlight } from "@/lib/ownerDashboardHighlight";
import type { OwnerCompetition } from "@/lib/ownerRewardDisplay";
import { useLoaderVisible } from "@/lib/useLoaderVisible";
import { useOwnerSheet } from "@/lib/useOwnerSheet";
import { useVenueMerchCart } from "@/lib/useVenueMerchCart";
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


/**
 * One section as `GET /api/owner/dashboard` sends it. `null` when the account has
 * no venue, so nothing was asked for (plan Phase 5).
 */
type WireList<T> = { ok: true; items: T[] } | { ok: false; error?: string } | null;

type DashboardPayload = {
  ok: boolean;
  error?: string;
  venues?: Venue[];
  venueId?: string | null;
  schedules?: WireList<OwnerSchedule>;
  competitions?: WireList<OwnerCompetition>;
};

/** The first load's answers, fetched with the page, handed to `DashboardBody` as its seed. */
type InitialLists = {
  /** The venue these answers are FOR. A venue switch must never inherit them.  */
  venueId: string;
  games: SectionLoad<OwnerSchedule>;
  rewards: SectionLoad<OwnerCompetition>;
  /** "Now" for upcoming-vs-past bucketing, stamped when the payload landed. */
  asOfMs: number;
};

/** One wire list -> that section's state, keeping its own per-section error. */
const toSectionLoad = <T,>(list: WireList<T> | undefined, fallbackMessage: string): SectionLoad<T> => {
  if (!list) return { status: "error", message: fallbackMessage };
  if (list.ok) return { status: "ready", items: list.items };
  return { status: "error", message: list.error ?? fallbackMessage };
};

type DashboardBodyProps = {
  venueId: string;
  venueName: string;
  /**
   * Both lists, already answered by the page's single `/api/owner/dashboard` call
   * (Phase 5). Present only for the venue they were fetched for; null otherwise,
   * and then the two effects below fetch as they always did.
   */
  initial?: InitialLists | null;
  /** Fired once both lists have answered, so the page can drop its first-load loader. */
  onReady: () => void;
};

// Keyed by venue at the call site: switching venues remounts it with fresh loading state.
const DashboardBody = ({ venueId, venueName, initial = null, onReady }: DashboardBodyProps) => {
  const router = useRouter();
  const sheet = useOwnerSheet();
  // The one-round-trip seed, accepted ONLY for the venue it was fetched for: this
  // body is keyed by venue, so a switch remounts it while `initial` may still
  // describe the venue the page first opened on. Belt and braces with the page,
  // which clears the seed once this body reports ready (see `handleBodyReady`).
  const seeded = initial && initial.venueId === venueId ? initial : null;
  const [games, setGames] = useState<SectionLoad<OwnerSchedule>>(seeded?.games ?? { status: "loading" });
  // "Now" for upcoming-vs-past bucketing, stamped when the games list arrives.
  const [gamesAsOfMs, setGamesAsOfMs] = useState(seeded?.asOfMs ?? 0);
  const [rewards, setRewards] = useState<SectionLoad<OwnerCompetition>>(seeded?.rewards ?? { status: "loading" });
  // Pinned at mount — state, not a ref, so nothing is read from a ref during render.
  // True = the first load is already in hand and its effect must not refetch it.
  const [prefetched] = useState(seeded !== null);
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

  // The two lists load in parallel (separate effects), once per venue — unless the
  // page already has them, in which case the first run is a no-op and only a Retry
  // or a post-save refetch (attempt > 0) goes back to the per-list endpoint.
  useEffect(() => {
    if (prefetched && gamesAttempt === 0) return;
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
  }, [venueId, gamesAttempt, onUnauthorized, prefetched]);

  useEffect(() => {
    if (prefetched && rewardsAttempt === 0) return;
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
  }, [venueId, rewardsAttempt, onUnauthorized, prefetched]);

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

  // "One loader, not loader-then-skeletons" (plan Phase 4, item 3): the page holds its
  // loader until venues AND both lists have answered — success or error, either is an
  // answer. The parent latches this, so a Retry (which puts one list back to "loading")
  // keeps today's in-place SectionSkeleton instead of re-raising the full loader.
  const sectionsAnswered = games.status !== "loading" && rewards.status !== "loading";
  useEffect(() => {
    if (sectionsAnswered) onReady();
  }, [sectionsAnswered, onReady]);

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

type MerchStoreHostProps = {
  venue: MerchVenueRef | null;
  venueLoading: boolean;
  cart: MerchCart;
  onCartChange: Dispatch<SetStateAction<MerchCart>>;
};

// The Join Merch store, opened from the menu's "Order Join Merch" row (?sheet=store).
// Hosted by the PAGE, outside DashboardBody, so the row opens it while venues load and
// on an account with no venue (join-merch-store-plan.md Phase 4.1, F2). Its own
// useOwnerSheet (idempotent landing normalisation), so it sits in its own Suspense.
// Look-only: no requests.
const MerchStoreHost = ({ venue, venueLoading, cart, onCartChange }: MerchStoreHostProps) => {
  const sheet = useOwnerSheet();
  return (
    <MerchStoreSheet
      nav={sheet}
      venue={venue}
      venueLoading={venueLoading}
      cart={cart}
      onCartChange={onCartChange}
    />
  );
};

const OwnerDashboardPage = () => {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  // Latched by DashboardBody's first pair of answers; never reset, so only the FIRST
  // load gets the loader (a venue switch remounts the body and shows section skeletons).
  const [bodyReady, setBodyReady] = useState(false);
  // Both section lists for the venue this page opens on, answered by the SAME call
  // that brought the venue list. Null = no venue, the call failed, or the seed has
  // already been consumed.
  const [initialLists, setInitialLists] = useState<InitialLists | null>(null);
  const handleBodyReady = useCallback(() => {
    setBodyReady(true);
    // CONSUME the seed. It describes one venue at one moment — the venue this page
    // opened on, as it was when it opened — and the body that just reported ready
    // holds it in state now. Keeping it would re-seed a LATER mount of the same
    // venue: switching A -> B -> A remounts the body with `initial` still matching
    // A, which re-adopts this stale payload AND suppresses both refetches
    // (`prefetched && attempt === 0`), so a game scheduled for A earlier in the
    // session silently vanishes with no loading state, and `gamesAsOfMs` keeps the
    // old "now" for upcoming-vs-past bucketing. Dropping it is safe: `initial` is
    // only read in useState initialisers and in the pinned `prefetched`, so this
    // never disturbs the mounted body.
    setInitialLists(null);
  }, []);
  // ONE round trip for the whole first paint: the venue list and both sections,
  // behind a single requireOwnerAuth (plan Phase 5 / finding F4). The three
  // per-list routes are still what a venue switch, a Retry and a post-save
  // refetch use — this only replaces the first load's three calls with one.
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/owner/dashboard", { cache: "no-store" });

        if (res.status === 401) {
          const body = (await res.json().catch(() => ({}))) as { code?: string };
          router.push(ownerAuthRecoveryPath(body.code));
          return;
        }

        const data = (await res.json()) as DashboardPayload;
        const loadedVenues = data.venues ?? [];
        setVenues(loadedVenues);
        const venueId = data.venueId ?? loadedVenues[0]?.id ?? "";
        setSelectedVenueId((prev) => prev || venueId);
        // Both lists or neither: a partial seed would leave one section stuck on
        // "loading" with nothing on the way, because its effect is suppressed.
        if (venueId && data.schedules && data.competitions) {
          setInitialLists({
            venueId,
            games: toSectionLoad(data.schedules, "Couldn't load your games."),
            rewards: toSectionLoad(data.competitions, "Couldn't load your rewards."),
            asOfMs: Date.now(),
          });
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const selectedVenue = useMemo(() => venues.find((v) => v.id === selectedVenueId), [venues, selectedVenueId]);
  // Join Merch carts, one per venue: kept across the store closing, never moved by a venue switch (F1).
  const [merchCart, setMerchCart] = useVenueMerchCart(selectedVenue?.id ?? null);

  // The loader is driven from the page (not from inside HightopLoader) because only the
  // caller can hold it visible long enough not to blink — see lib/useLoaderVisible.ts.
  const firstLoadPending = loading || (selectedVenueId !== "" && !bodyReady);
  const showLoader = useLoaderVisible(firstLoadPending);
  const revealed = !firstLoadPending && !showLoader;

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
      {showLoader ? <HightopLoader size="lg" delayMs={0} className="py-14" /> : null}
      {revealed && !selectedVenueId ? (
        <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
          <p className="text-sm font-semibold text-ht-muted">No venue found for this account.</p>
        </div>
      ) : null}
      {!loading && selectedVenueId ? (
        // Mounted (so its two fetches run) but display:none until both have answered —
        // that is what makes the reveal one step instead of loader-then-skeletons. The
        // Suspense fallback is null on purpose: DashboardBody is not mounted while it is
        // suspended, so nothing has been requested yet and the loader above still stands.
        <div className={revealed ? "space-y-4" : "hidden"}>
          <Suspense fallback={null}>
            <DashboardBody
              key={selectedVenueId}
              venueId={selectedVenueId}
              venueName={selectedVenue?.name ?? "This venue"}
              initial={initialLists}
              onReady={handleBodyReady}
            />
          </Suspense>
        </div>
      ) : null}
      <Suspense fallback={null}>
        <MerchStoreHost
          venue={selectedVenue ?? null}
          venueLoading={loading}
          cart={merchCart}
          onCartChange={setMerchCart}
        />
      </Suspense>
    </OwnerShell>
  );
};

export default OwnerDashboardPage;
