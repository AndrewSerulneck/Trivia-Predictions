import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { VenueHubClient } from "@/components/venue/VenueHubClient";
import { getLeaderboardForVenue } from "@/lib/leaderboard";
import { getVenueById } from "@/lib/venues";
import { getVenueDisplayName } from "@/lib/venueDisplay";
import { APP_PAGE_NAMES } from "@/lib/pageNames";

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
    <PageShell title={APP_PAGE_NAMES.venue} description={venueDisplayName} noContainer>
      <div className="h-full space-y-4 overflow-y-auto">
        <VenueHubClient venue={venue} initialEntries={entries} />
      </div>
    </PageShell>
  );
}
