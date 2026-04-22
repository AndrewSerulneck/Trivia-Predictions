import { PageShell } from "@/components/ui/PageShell";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { BackButton } from "@/components/navigation/BackButton";

export default function ActivityPage() {
  return (
    <PageShell title="Activity" description="Your prediction picks and notification history.">
      <div className="space-y-4">
        <BackButton label="Back" venueHomeFallback />
        <ActivityTimeline />
      </div>
    </PageShell>
  );
}
