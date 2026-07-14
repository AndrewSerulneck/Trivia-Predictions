import { ChallengeRedeemPanel } from "@/components/challenges/ChallengeRedeemPanel";
import { PageShell } from "@/components/ui/PageShell";
import { VenuePresenceBoundary } from "@/components/venue/VenuePresenceBoundary";

export default async function VenueRedeemPage({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;

  return (
    <PageShell title="" showPageTitle={false}>
      <VenuePresenceBoundary venueId={venueId}>
        <ChallengeRedeemPanel venueId={venueId} />
      </VenuePresenceBoundary>
    </PageShell>
  );
}
