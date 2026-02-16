import { PageShell } from "@/components/ui/PageShell";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";

export default function ActivityPage() {
  return (
    <PageShell title="Activity" description="Recent answers, picks, and outcomes.">
      <ActivityTimeline />
    </PageShell>
  );
}
