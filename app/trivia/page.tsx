import { PageShell } from "@/components/ui/PageShell";
import { SlotAd } from "@/components/ui/SlotAd";
import { TriviaGame } from "@/components/trivia/TriviaGame";

export default function TriviaPage() {
  return (
    <PageShell title="Trivia" description="Daily trivia gameplay and scoring.">
      <div className="space-y-4">
        <TriviaGame />
        <SlotAd slot="inline-content" />
      </div>
    </PageShell>
  );
}
