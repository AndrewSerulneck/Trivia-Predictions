import { ChallengeRedeemPanel } from "@/components/challenges/ChallengeRedeemPanel";
import { PageShell } from "@/components/ui/PageShell";

export default async function VenueRedeemPage({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;

  return (
    <PageShell title="" showPageTitle={false}>
      <ChallengeRedeemPanel venueId={venueId} />
    </PageShell>
  );
}
