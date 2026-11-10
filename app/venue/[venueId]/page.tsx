import { notFound } from "next/navigation";
import { VenuePresenceBoundary } from "@/components/venue/VenuePresenceBoundary";
import { PageShell } from "@/components/ui/PageShell";
import { VenueHubClient } from "@/components/venue/VenueHubClient";
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

  return (
    <PageShell title="" noContainer showPageTitle={false} showBranding={false} showUserStatus={false} showAlerts>
      <div className="min-h-0 w-full overflow-x-hidden">
        {/* Away from the bar, Venue Home is view-only instead of overlaid (away-mode plan, Phase C1). */}
        <VenuePresenceBoundary venueId={venue.id} awayMode>
          <VenueHubClient venue={venue} />
        </VenuePresenceBoundary>
      </div>
    </PageShell>
  );
}
