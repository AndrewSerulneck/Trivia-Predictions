import { cookies } from "next/headers";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { PageShell } from "@/components/ui/PageShell";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import { getLeaderboardForVenue } from "@/lib/leaderboard";
import { listVenues } from "@/lib/venues";
import { getVenueDisplayName } from "@/lib/venueDisplay";
import Link from "next/link";
import { BackButton } from "@/components/navigation/BackButton";

export default async function LeaderboardPage() {
  const venues = await listVenues();
  const cookieStore = await cookies();
  const selectedVenueId = cookieStore.get("tp_venue_id")?.value?.trim() ?? "";
  const selectedVenue = venues.find((venue) => venue.id === selectedVenueId) ?? null;
  const entries = selectedVenue ? await getLeaderboardForVenue(selectedVenue.id) : [];

  return (
    <PageShell
      title="Leaderboard"
      description="Venue-specific ranking and point totals."
    >
      <div className="space-y-4">
        <BackButton label="Back" />
        {!selectedVenue ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            Join a venue to view leaderboard stats.
            <Link href="/" className="ml-2 font-medium underline">
              Go to join page
            </Link>
          </div>
        ) : null}
        {selectedVenue && (
          <p className="text-sm text-slate-600">
            Showing top players for <strong>{getVenueDisplayName(selectedVenue)}</strong>.
          </p>
        )}

        {selectedVenue ? <LeaderboardTable venueId={selectedVenue.id} initialEntries={entries} /> : null}

        <InlineSlotAdClient slot="leaderboard-sidebar" venueId={selectedVenue?.id} showPlaceholder={false} />
      </div>
    </PageShell>
  );
}
