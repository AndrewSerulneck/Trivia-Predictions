import { ActiveGamesPanel } from "@/components/activity/ActiveGamesPanel";
import { BackButton } from "@/components/navigation/BackButton";
import { PageShell } from "@/components/ui/PageShell";

export default function ActiveGamesPage() {
  return (
    <PageShell title="" showPageTitle={false}>
      <div className="space-y-3">
        <BackButton label="Back" venueHomeFallback />
        <ActiveGamesPanel />
      </div>
    </PageShell>
  );
}
