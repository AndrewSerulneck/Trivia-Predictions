import { PendingChallengesPanel } from "@/components/challenges/PendingChallengesPanel";
import { PageShell } from "@/components/ui/PageShell";

export default function PendingChallengesPage() {
  return (
    <PageShell title="" showPageTitle={false} backTo={{ label: "Back", venueHomeFallback: true }}>
      <div className="space-y-3">
        <PendingChallengesPanel />
      </div>
    </PageShell>
  );
}
