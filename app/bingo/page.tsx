import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import { SportsBingoBoard } from "@/components/bingo/SportsBingoBoard";
import { APP_PAGE_NAMES } from "@/lib/pageNames";

export default function SportsBingoPage() {
  return (
    <PageShell
      title={APP_PAGE_NAMES.sportsBingo}
      description="Choose a sport, pick an upcoming game, reroll boards, and lock your card before game start."
    >
      <div className="h-full space-y-4 overflow-y-auto pr-1">
        <BackButton label="Back" />
        <SportsBingoBoard />
      </div>
    </PageShell>
  );
}
