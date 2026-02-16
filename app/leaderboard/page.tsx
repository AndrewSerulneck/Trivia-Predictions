import Link from "next/link";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { PageShell } from "@/components/ui/PageShell";
import { SlotAd } from "@/components/ui/SlotAd";
import { getLeaderboardForVenue } from "@/lib/leaderboard";
import { listVenues } from "@/lib/venues";

type LeaderboardPageProps = {
  searchParams?: Promise<{ venue?: string }>;
};

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  const params = searchParams ? await searchParams : {};
  const venues = await listVenues();
  const selectedVenueId = params.venue ?? venues[0]?.id ?? "";
  const selectedVenue = venues.find((venue) => venue.id === selectedVenueId) ?? venues[0] ?? null;
  const entries = selectedVenue ? await getLeaderboardForVenue(selectedVenue.id) : [];

  return (
    <PageShell
      title="Leaderboard"
      description="Venue-specific ranking and point totals."
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Select venue</p>
          <div className="flex flex-wrap gap-2">
            {venues.map((venue) => {
              const isSelected = selectedVenue?.id === venue.id;
              return (
                <Link
                  key={venue.id}
                  href={`/leaderboard?venue=${venue.id}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    isSelected
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {venue.name}
                </Link>
              );
            })}
          </div>
        </div>

        {selectedVenue && (
          <p className="text-sm text-slate-600">
            Showing top players for <strong>{selectedVenue.name}</strong>.
          </p>
        )}

        {selectedVenue ? <LeaderboardTable venueId={selectedVenue.id} initialEntries={entries} /> : null}

        <SlotAd slot="leaderboard-sidebar" venueId={selectedVenue?.id} />
      </div>
    </PageShell>
  );
}
