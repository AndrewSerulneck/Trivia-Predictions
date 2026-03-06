import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { VenueHubClient } from "@/components/venue/VenueHubClient";
import { getLeaderboardForVenue } from "@/lib/leaderboard";
import { getVenueById } from "@/lib/venues";
import { SlotAd } from "@/components/ui/SlotAd";
import { getVenueDisplayName } from "@/lib/venueDisplay";

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
  const venueDisplayName = getVenueDisplayName(venue);

  return (
    <PageShell title={venueDisplayName}>
      <div className="space-y-4">
        <VenueHubClient venue={venue} initialEntries={entries} />
        <section className="space-y-2">
          <SlotAd slot="leaderboard-sidebar" venueId={venue.id} showPlaceholder />
        </section>
      </div>
    </PageShell>
  );
}
