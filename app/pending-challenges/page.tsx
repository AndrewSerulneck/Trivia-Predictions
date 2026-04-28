import { BackButton } from "@/components/navigation/BackButton";
import { PendingChallengesPanel } from "@/components/challenges/PendingChallengesPanel";
import { PageShell } from "@/components/ui/PageShell";

export default function PendingChallengesPage() {
  return (
    <PageShell title="" showPageTitle={false}>
      <div className="space-y-3">
        <BackButton label="Back" venueHomeFallback />
        <PendingChallengesPanel />
      </div>
    </PageShell>
  );
}
