import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
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
    <PageShell title="" noContainer showPageTitle={false} showBranding={false} showAlerts>
      <div className="h-full space-y-3 overflow-y-auto">
        <VenueHubClient venue={venue} initialEntries={entries} />
      </div>
    </PageShell>
  );
}
