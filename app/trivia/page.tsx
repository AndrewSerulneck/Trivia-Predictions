import { PageShell } from "@/components/ui/PageShell";
import { TriviaGame } from "@/components/trivia/TriviaGame";
import { BackButton } from "@/components/navigation/BackButton";

export default function TriviaPage() {
  return (
    <PageShell title="Trivia">
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
        <BackButton label="Back" />
        <div className="min-h-0 flex-1 overflow-hidden">
          <TriviaGame />
        </div>
      </div>
    </PageShell>
  );
}
