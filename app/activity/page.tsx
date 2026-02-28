import { PageShell } from "@/components/ui/PageShell";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";

export default function ActivityPage() {
  return (
    <PageShell title="Activity" description="Your prediction picks and notification history.">
      <ActivityTimeline />
    </PageShell>
  );
}
