import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import { VenueHubClient } from "@/components/venue/VenueHubClient";
import { getVenueById } from "@/lib/venues";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
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
  const venueDisplayName = getVenueDisplayName(venue);

  return (
    <PageShell title={venueDisplayName}>
      <div className="space-y-4">
        <VenueHubClient venue={venue} />
        <section className="space-y-2">
          <InlineSlotAdClient slot="leaderboard-sidebar" venueId={venue.id} showPlaceholder />
        </section>
      </div>
    </PageShell>
  );
}
