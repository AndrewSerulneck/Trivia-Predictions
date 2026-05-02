import { CareerStatsPanel } from "@/components/activity/CareerStatsPanel";
import { BackButton } from "@/components/navigation/BackButton";
import { PageShell } from "@/components/ui/PageShell";

export default function ActiveGamesPage() {
  return (
    <PageShell title="Career Stats" description="Your performance across Trivia, Bingo, Pick 'Em, and Fantasy.">
      <div className="space-y-3">
        <BackButton label="Back" venueHomeFallback />
        <CareerStatsPanel />
      </div>
    </PageShell>
  );
}
