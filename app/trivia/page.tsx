import { PageShell } from "@/components/ui/PageShell";
import { SlotAd } from "@/components/ui/SlotAd";
import { TriviaGame } from "@/components/trivia/TriviaGame";
import { BackButton } from "@/components/navigation/BackButton";

export default function TriviaPage() {
  return (
    <PageShell title="Trivia" description="Daily trivia gameplay and scoring.">
      <div className="space-y-4">
        <BackButton label="Back" />
        <TriviaGame />
        <SlotAd slot="inline-content" />
      </div>
    </PageShell>
  );
}
