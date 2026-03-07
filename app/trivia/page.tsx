import { PageShell } from "@/components/ui/PageShell";
import { SlotAd } from "@/components/ui/SlotAd";
import { TriviaGame } from "@/components/trivia/TriviaGame";
import { BackButton } from "@/components/navigation/BackButton";

export default function TriviaPage() {
  return (
    <PageShell title="Trivia" description="Daily trivia gameplay and scoring.">
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        <BackButton label="Back" />
        <div className="min-h-0 flex-1 overflow-hidden">
          <TriviaGame />
        </div>
        <SlotAd slot="inline-content" />
      </div>
    </PageShell>
  );
}
