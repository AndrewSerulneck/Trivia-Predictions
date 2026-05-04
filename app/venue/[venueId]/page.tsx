import { notFound } from "next/navigation";
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
    <PageShell title="" noContainer showPageTitle={false} showBranding={false} showAlerts>
      <div className="min-h-0 w-full overflow-x-hidden">
        <VenueHubClient venue={venue} />
      </div>
    </PageShell>
  );
}
