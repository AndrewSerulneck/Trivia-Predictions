import { PageShell } from "@/components/ui/PageShell";
import { SlotAd } from "@/components/ui/SlotAd";
import { TriviaGame } from "@/components/trivia/TriviaGame";
import { getTriviaQuestions } from "@/lib/trivia";

export default async function TriviaPage() {
  const questions = await getTriviaQuestions();

  return (
    <PageShell title="Trivia" description="Daily trivia gameplay and scoring.">
      <div className="space-y-4">
        <TriviaGame questions={questions} />
        <SlotAd slot="inline-content" />
      </div>
    </PageShell>
  );
}
