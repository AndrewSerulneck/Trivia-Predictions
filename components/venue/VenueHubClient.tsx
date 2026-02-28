"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { clearVenueSession, getUserId, getVenueId } from "@/lib/storage";
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

  const leaveVenue = () => {
    clearVenueSession();
    router.push("/");
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={leaveVenue}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Leave Venue
        </button>
      </div>

      <section className="grid grid-cols-2 gap-3">
        <Link
          href="/trivia"
          className="flex aspect-square flex-col items-center justify-center gap-3 rounded-lg bg-blue-700 px-3 py-3 text-center text-base font-semibold text-white"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-10 w-10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 3h6l1 3h3v2a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5V6h3l1-3z" />
            <path d="M8 18h8" />
            <path d="M12 13v5" />
          </svg>
          Play Trivia!
        </Link>
        <Link
          href="/predictions"
          className="flex aspect-square flex-col items-center justify-center gap-3 rounded-lg bg-slate-900 px-3 py-3 text-center text-base font-semibold text-white"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-10 w-10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 19h16" />
            <path d="M6 16V9" />
            <path d="M12 16V5" />
            <path d="M18 16v-3" />
            <circle cx="6" cy="8" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="12" cy="4" r="1.2" fill="currentColor" stroke="none" />
            <circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none" />
          </svg>
          Make Predictions!
        </Link>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{venue.name} Leaderboard</h2>
        <p className="text-sm text-slate-600">Compete with players currently joined at this venue.</p>
        <LeaderboardTable venueId={venue.id} initialEntries={initialEntries} />
      </section>
    </div>
  );
}
