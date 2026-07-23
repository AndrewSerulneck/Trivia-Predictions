"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { Dropdown } from "@/components/ui/Dropdown";

type Subscription = {
  venueId: string;
  planType: string;
  amountCents: number;
  status: "active" | "past_due" | "cancelled";
  currentPeriodEnd: string | null;
  isManual: boolean;
};

type Venue = {
  id: string;
  name: string;
};

type OwnerScheduleSummary = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  timezone: string;
};

type CompetitionSummary = {
  id: string;
  name: string;
  isActive: boolean;
  winnerUserId?: string | null;
};

type VenuePresenceDiagnostics = {
  ok: boolean;
  windowMinutes?: number;
  venues?: Array<{
    venueId: string;
    activeSessions: number;
    pausedSessions: number;
    expiredSessions: number;
    eventCounts: {
      verified: number;
      outOfRange: number;
      locationUnavailable: number;
      expired: number;
      required: number;
      profileMismatch: number;
      unavailable: number;
    };
    quickRecoveries: number;
    quickRecoveryRate: number;
    lastEventAt: string | null;
    recentEvents: Array<{
      at: string;
      type: string;
      code: string | null;
      status: string;
      source: string;
      distanceMeters: number | null;
      allowedDistanceMeters: number | null;
      accuracyMeters: number | null;
    }>;
  }>;
  warnings?: string[];
};

type PillTone = "emerald" | "amber" | "cyan" | "slate" | "rose";

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "—";

const pillToneClass: Record<PillTone, string> = {
  emerald: "bg-ht-emerald-500/15 text-ht-emerald-300",
  amber: "bg-ht-amber-500/15 text-ht-amber-300",
  cyan: "bg-ht-cyan-500/15 text-ht-cyan-300",
  slate: "bg-white/8 text-ht-muted",
  rose: "bg-ht-rose-500/15 text-ht-rose-300",
};

const dotToneClass: Record<PillTone, string> = {
  emerald: "bg-ht-emerald-400",
  amber: "bg-ht-amber-400",
  cyan: "bg-ht-cyan-400",
  slate: "bg-slate-500",
  rose: "bg-ht-rose-400",
};

const StatusPill = ({ tone, label, pulse }: { tone: PillTone; label: string; pulse?: boolean }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider ${pillToneClass[tone]}`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${dotToneClass[tone]} ${pulse ? "animate-ht-pulse" : ""}`} />
    {label}
  </span>
);

type TileStatus = { tone: PillTone; label: string; pulse?: boolean; trailing?: string };

const billingStatus = (sub: Subscription | undefined): TileStatus => {
  if (!sub) return { tone: "cyan", label: "Set up" };
  if (sub.status === "active") {
    return sub.isManual
      ? { tone: "amber", label: "Active — offline", trailing: `Paid through ${formatDate(sub.currentPeriodEnd)}` }
      : { tone: "emerald", label: "Active", trailing: `Renews ${formatDate(sub.currentPeriodEnd)}` };
  }
  if (sub.status === "past_due") return { tone: "rose", label: "Payment due" };
  return { tone: "slate", label: "Cancelled", trailing: `Ends ${formatDate(sub.currentPeriodEnd)}` };
};

const OwnerDashboardPage = () => {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [nextSchedule, setNextSchedule] = useState<OwnerScheduleSummary | null>(null);
  const [activeCompetitionCount, setActiveCompetitionCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [venuesRes, billingRes] = await Promise.all([
          fetch("/api/owner/venues"),
          fetch("/api/owner/billing"),
        ]);

        if (venuesRes.status === 401 || billingRes.status === 401) {
          router.push("/owner/login");
          return;
        }

        const venuesData = (await venuesRes.json()) as { ok: boolean; venues?: Venue[] };
        const billingData = (await billingRes.json()) as { ok: boolean; subscriptions?: Subscription[] };

        const loadedVenues = venuesData.venues ?? [];
        setVenues(loadedVenues);
        setSubscriptions(billingData.subscriptions ?? []);
        setSelectedVenueId((prev) => prev || loadedVenues[0]?.id || "");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  useEffect(() => {
    if (!selectedVenueId) {
      setNextSchedule(null);
      return;
    }
    let cancelled = false;
    const loadSchedule = async () => {
      try {
        const res = await fetch(
          `/api/owner/schedule?venueId=${encodeURIComponent(selectedVenueId)}&gameType=category_blitz`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { ok: boolean; schedules?: OwnerScheduleSummary[] };
        if (cancelled) return;
        const nowMs = Date.now();
        const next = (json.schedules ?? [])
          .filter((s) => Date.parse(s.endTime) >= nowMs)
          .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))[0];
        setNextSchedule(next ?? null);
      } catch {
        if (!cancelled) setNextSchedule(null);
      }
    };
    void loadSchedule();
    return () => {
      cancelled = true;
    };
  }, [selectedVenueId]);

  useEffect(() => {
    if (!selectedVenueId) {
      setActiveCompetitionCount(null);
      return;
    }
    let cancelled = false;
    const loadCompetitions = async () => {
      try {
        const res = await fetch(
          `/api/owner/competitions?venueId=${encodeURIComponent(selectedVenueId)}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as { ok: boolean; competitions?: CompetitionSummary[] };
        if (cancelled) return;
        const count = (json.competitions ?? []).filter((c) => c.isActive && !c.winnerUserId).length;
        setActiveCompetitionCount(count);
      } catch {
        if (!cancelled) setActiveCompetitionCount(null);
      }
    };
    void loadCompetitions();
    return () => {
      cancelled = true;
    };
  }, [selectedVenueId]);

  const selectedVenue = useMemo(() => venues.find((v) => v.id === selectedVenueId), [venues, selectedVenueId]);
  const selectedSub = useMemo(
    () => subscriptions.find((s) => s.venueId === selectedVenueId),
    [subscriptions, selectedVenueId]
  );

  const handleLogout = async () => {
    await fetch("/api/owner/auth/logout", { method: "POST" });
    router.push("/owner/login");
  };

  const tiles: Array<{
    href: string;
    label: string;
    description: string;
    gradient: string;
    glyph: string;
    status: TileStatus;
  }> = [
    {
      href: "/owner/schedule",
      label: "Live Games",
      description: "Schedule games the whole room plays together",
      gradient: "bg-ht-game-live",
      glyph: "🎮",
      status: nextSchedule
        ? {
            tone: "amber",
            label: "Next up",
            trailing: `${nextSchedule.title} · ${formatTime(nextSchedule.startTime)}`,
          }
        : { tone: "slate", label: "No games scheduled" },
    },
    {
      href: "/owner/display",
      label: "Venue Display",
      description: "QR + link for the TVs so the room can follow along",
      gradient: "bg-ht-game-display",
      glyph: "📺",
      status: selectedVenue
        ? { tone: "emerald", label: "Display ready" }
        : { tone: "slate", label: "No venue" },
    },
    {
      href: "/owner/billing",
      label: "Billing",
      description: "Subscription, payment method & invoices",
      gradient: "bg-ht-game-billing",
      glyph: "💳",
      status: billingStatus(selectedSub),
    },
    {
      href: "/owner/competitions",
      label: "Offer Rewards",
      description: "Schedule contests and offer prizes to boost engagement.",
      gradient: "bg-ht-game-pickem",
      glyph: "🏆",
      status:
        activeCompetitionCount === null
          ? { tone: "slate", label: "No data" }
          : activeCompetitionCount > 0
            ? { tone: "emerald", label: `${activeCompetitionCount} running` }
            : { tone: "slate", label: "None running" },
    },
  ];

  const venueInitial = (selectedVenue?.name ?? "?").charAt(0).toUpperCase();

  return (
    <OwnerShell title="Partner Dashboard" subtitle="Run your venue from your phone" maxWidth="lg" variant="dark">
      {loading ? (
        <p className="text-center text-sm font-semibold text-ht-muted">Loading…</p>
      ) : (
        <div className="space-y-5">
          {/* Venue switcher — the card itself is the trigger for multi-venue owners */}
          {selectedVenue ? (
            venues.length > 1 ? (
              <Dropdown
                value={selectedVenueId}
                onChange={setSelectedVenueId}
                options={venues.map((v) => ({ value: v.id, label: v.name }))}
                ariaLabel="Select venue"
                className="flex w-full items-center gap-3 rounded-2xl border border-ht-hairline bg-ht-surface p-3 text-left shadow-ht-card"
                renderTrigger={(_selected, isOpen) => (
                  <>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ht-game-live text-lg font-black text-slate-950">
                      {venueInitial}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-black text-ht-primary">{selectedVenue.name}</div>
                      <div className="text-[11px] font-black uppercase tracking-wider text-ht-muted">
                        {venues.length} venues · tap to switch
                      </div>
                    </div>
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
              <div className="flex items-center gap-3 rounded-2xl border border-ht-hairline bg-ht-surface p-3 shadow-ht-card">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ht-game-live text-lg font-black text-slate-950">
                  {venueInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-black text-ht-primary">{selectedVenue.name}</div>
                </div>
              </div>
            )
          ) : null}

          <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">Run your room</p>

          <div className="grid gap-3">
            {tiles.map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className="group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-ht-hairline bg-ht-surface p-4 shadow-ht-card transition-colors hover:border-ht-soft"
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${tile.gradient}`}
                >
                  {tile.glyph}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-ht-primary">{tile.label}</div>
                  <div className="mt-0.5 text-xs font-semibold text-ht-muted">{tile.description}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <StatusPill tone={tile.status.tone} label={tile.status.label} pulse={tile.status.pulse} />
                    {tile.status.trailing ? (
                      <span className="text-xs font-bold text-ht-secondary">{tile.status.trailing}</span>
                    ) : null}
                  </div>
                </div>
                <span className="self-center text-lg text-slate-500 transition-transform group-hover:translate-x-0.5" aria-hidden>
                  ›
                </span>
              </Link>
            ))}
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2 text-center text-sm font-semibold text-ht-muted transition-colors hover:text-ht-secondary"
          >
            Sign out
          </button>
        </div>
      )}
    </OwnerShell>
  );
};

export default OwnerDashboardPage;
