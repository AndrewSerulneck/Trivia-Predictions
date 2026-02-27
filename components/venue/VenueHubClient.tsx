"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { getUserId, getVenueId } from "@/lib/storage";
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

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">{venue.name} Leaderboard</h2>
        <p className="text-sm text-slate-600">Compete with players currently joined at this venue.</p>
        <LeaderboardTable venueId={venue.id} initialEntries={initialEntries} />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/trivia"
          className="rounded-lg bg-blue-700 px-4 py-3 text-center text-base font-semibold text-white"
        >
          Play Trivia!
        </Link>
        <Link
          href="/predictions"
          className="rounded-lg bg-slate-900 px-4 py-3 text-center text-base font-semibold text-white"
        >
          Make Predictions!
        </Link>
      </section>
    </div>
  );
}
