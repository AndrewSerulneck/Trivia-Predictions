"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { PartnerManual } from "@/components/owner/PartnerManual";
import { Dropdown } from "@/components/ui/Dropdown";
import { ownerAuthRecoveryPath } from "@/lib/ownerAuthCodes";

type Venue = {
  id: string;
  name: string;
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

  const tiles: Array<{
    href: string;
    label: string;
    description: string;
    gradient: string;
    glyph: string;
  }> = [
    {
      href: "/owner/schedule",
      label: "Schedule Live Games",
      description: "Schedule games the whole room plays together",
      gradient: "bg-ht-game-live",
      glyph: "🎮",
    },
    {
      href: "/owner/competitions",
      label: "Offer Rewards",
      description: "Schedule contests and offer prizes to boost engagement.",
      gradient: "bg-ht-game-pickem",
      glyph: "🏆",
    },
    {
      href: "/owner/game-settings",
      label: "Game Settings",
      description: "Choose how NFL Pick 'Em is scored at this venue",
      gradient: "bg-ht-game-pickem",
      glyph: "🏈",
    },
    {
      href: "/owner/display",
      label: "Venue Display",
      description: "QR + link for the TVs so the room can follow along",
      gradient: "bg-ht-game-display",
      glyph: "📺",
    },
    {
      href: "/owner/billing",
      label: "Billing",
      description: "Subscription, payment method & invoices",
      gradient: "bg-ht-game-billing",
      glyph: "💳",
    },
    {
      href: "/owner/account",
      label: "Account Settings",
      description: "Email address and password",
      gradient: "bg-ht-game-fantasy",
      glyph: "⚙️",
    }
  ];

  const venueInitial = (selectedVenue?.name ?? "?").charAt(0).toUpperCase();

  return (
    <OwnerShell
      title="Partner Dashboard"
      subtitle="Run your venue from your phone"
      maxWidth="lg"
      variant="dark"
      showAccountMenu
    >
      {loading ? (
        <p className="text-center text-sm font-semibold text-ht-muted">Loading…</p>
      ) : (
        <div className="space-y-5">
          {/* Venue switcher — the card itself is the trigger for multi-venue owners */}
          {selectedVenue ? (
            venues.length > 1 ? (
              <div className="relative">
                <Dropdown
                  value={selectedVenueId}
                  onChange={setSelectedVenueId}
                  options={venues.map((v) => ({ value: v.id, label: v.name }))}
                  ariaLabel="Select venue"
                  className="flex w-full items-center gap-4 rounded-2xl border border-ht-hairline bg-ht-surface p-3 pr-48 text-left shadow-ht-card"
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
                <PartnerManual className="absolute right-10 top-1/2 z-10 -translate-y-1/2" />
              </div>
            ) : (
              <div className="flex items-center gap-4 rounded-2xl border border-ht-hairline bg-ht-surface p-3 shadow-ht-card">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ht-game-live text-lg font-black text-slate-950">
                  {venueInitial}
                </div>
                <div className="min-w-0 flex-1 pr-2">
                  <div className="truncate font-black text-ht-primary">{selectedVenue.name}</div>
                </div>
                <PartnerManual />
              </div>
            )
          ) : null}

          <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">Run your room</p>

          <div className="grid grid-cols-2 gap-3">
            {tiles.map((tile) => (
              <Link
                key={tile.href}
                href={tile.href}
                className="group relative flex min-w-0 flex-col items-start gap-2 overflow-hidden rounded-2xl border border-ht-hairline bg-ht-surface p-3 shadow-ht-card transition-colors hover:border-ht-soft"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${tile.gradient}`}
                >
                  {tile.glyph}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="pr-4 font-black text-ht-primary">{tile.label}</div>
                  <div className="mt-0.5 text-xs font-semibold text-ht-muted">{tile.description}</div>
                </div>
                <span className="absolute right-3 top-3 text-lg text-slate-500 transition-transform group-hover:translate-x-0.5" aria-hidden>
                  ›
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </OwnerShell>
  );
};

export default OwnerDashboardPage;
