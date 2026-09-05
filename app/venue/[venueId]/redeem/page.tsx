import { ChallengeRedeemPageShell } from "@/components/challenges/ChallengeRedeemPageShell";

export default async function VenueRedeemPage({ params }: { params: Promise<{ venueId: string }> }) {
  const { venueId } = await params;

  return <ChallengeRedeemPageShell venueId={venueId} />;
}
