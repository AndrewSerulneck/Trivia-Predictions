import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { SlotAd } from "@/components/ui/SlotAd";
import { VenueHubClient } from "@/components/venue/VenueHubClient";
import { getLeaderboardForVenue } from "@/lib/leaderboard";
import { getVenueById } from "@/lib/venues";

export default async function VenuePage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = await params;
  const venue = await getVenueById(venueId);
  if (!venue) {
    notFound();
  }

  const entries = await getLeaderboardForVenue(venue.id);

  return (
    <PageShell title={venue.name}>
      <div className="space-y-4">
        <VenueHubClient venue={venue} initialEntries={entries} />
        <SlotAd slot="leaderboard-sidebar" venueId={venue.id} />
      </div>
    </PageShell>
  );
}
