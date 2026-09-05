import { CareerStatsPanel } from "@/components/activity/CareerStatsPanel";
import { PageShell } from "@/components/ui/PageShell";

export default function ActiveGamesPage() {
  return (
    <PageShell
      title="Career Stats"
      description="Your performance across Trivia, Bingo, Pick 'Em, and Fantasy."
      showPageTitle={false}
      backTo={{ label: "Back", venueHomeFallback: true }}
    >
      <div className="space-y-3">
        <CareerStatsPanel />
      </div>
    </PageShell>
  );
}
