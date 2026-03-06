"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { clearVenueSession, getUserId, getVenueId } from "@/lib/storage";
import { getVenueDisplayName } from "@/lib/venueDisplay";
import type { LeaderboardEntry, Venue } from "@/types";

export function VenueHubClient({
  venue,
  initialEntries,
}: {
  venue: Venue;
  initialEntries: LeaderboardEntry[];
}) {
  const router = useRouter();

  useEffect(() => {
    const storedUserId = getUserId() ?? "";
    const storedVenueId = getVenueId() ?? "";
    if (!storedUserId) {
      router.replace(`/?v=${venue.id}`);
      return;
    }
    if (storedVenueId !== venue.id) {
      router.replace(`/?v=${venue.id}`);
    }
  }, [router, venue.id]);

  const venueDisplayName = getVenueDisplayName(venue);

  const triggerExit = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([22, 40, 22]);
    }
  };

  const leaveVenue = () => {
    triggerExit();
    clearVenueSession();
    router.push("/");
  };

  const triggerPulse = () => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    navigator.vibrate(14);
  };
  const ctaClass =
    "inline-flex min-h-[96px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 px-3 py-4 text-center text-base font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95";

  return (
    <div className="space-y-5">
      <div className="flex justify-start">
        <button
          type="button"
          onClick={leaveVenue}
          className="group inline-flex items-center gap-2 rounded-full border border-rose-700 bg-gradient-to-r from-rose-600 to-rose-700 px-4 py-2.5 text-sm font-semibold tracking-wide text-white shadow-lg shadow-rose-200 transition-all active:scale-95 active:brightness-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm"
          >
            🚪
          </span>
          <span>Leave Venue</span>
          <span
            aria-hidden="true"
            className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 transition group-hover:translate-x-1"
          >
            EXIT
          </span>
        </button>
      </div>

      <section className="grid grid-cols-2 gap-3">
        <Link
          onMouseDown={triggerPulse}
          href="/trivia"
          role="button"
          className={`${ctaClass} bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-200 hover:from-blue-700 hover:to-cyan-600 active:scale-95`}
        >
          <span aria-hidden="true" className="text-4xl leading-none">
            🎯
          </span>
          Play Trivia!
        </Link>
        <Link
          onMouseDown={triggerPulse}
          href="/predictions"
          role="button"
          className={`${ctaClass} bg-gradient-to-br from-slate-800 to-violet-700 text-white shadow-md shadow-violet-200 hover:from-slate-900 hover:to-violet-800 active:scale-95`}
        >
          <span aria-hidden="true" className="text-4xl leading-none">
            🔮
          </span>
          Make Predictions!
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{venueDisplayName} Leaderboard</h2>
        <p className="text-sm text-slate-600">Compete with players currently joined at this venue.</p>
        <LeaderboardTable venueId={venue.id} initialEntries={initialEntries} />
      </section>
    </div>
  );
}
