"use client";

import { useState } from "react";
import { ChallengeRedeemPanel } from "@/components/challenges/ChallengeRedeemPanel";
import { PageShell } from "@/components/ui/PageShell";
import { VenuePresenceBoundary } from "@/components/venue/VenuePresenceBoundary";

// Thin client wrapper so ChallengeRedeemPanel's `backToVenue` teardown (saves
// gauge progress, then runs the venue-return transition) can be lifted into
// PageShell's `backTo` header slot instead of an inline pill in the panel
// body. See docs/navigation-unification-plan.md Phase 2.
export function ChallengeRedeemPageShell({ venueId }: { venueId: string }) {
  const [exit, setExit] = useState<(() => void) | null>(null);

  return (
    <PageShell
      title=""
      showPageTitle={false}
      backTo={{ label: "Back to Venue", onExit: exit ?? undefined }}
    >
      <VenuePresenceBoundary venueId={venueId}>
        <ChallengeRedeemPanel venueId={venueId} onExitReady={(fn) => setExit(() => fn)} />
      </VenuePresenceBoundary>
    </PageShell>
  );
}
