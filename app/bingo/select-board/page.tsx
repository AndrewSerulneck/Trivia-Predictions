import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import { SportsBingoSelectBoard } from "@/components/bingo/SportsBingoSelectBoard";
import { APP_PAGE_NAMES } from "@/lib/pageNames";

export default function SportsBingoSelectBoardPage() {
  return (
    <PageShell
      title={APP_PAGE_NAMES.sportsBingo}
      description="Step 3: Generate a board and lock it before game start."
    >
      <div className="h-full space-y-4 overflow-y-auto pr-1">
        <BackButton href="/bingo/select-game" label="Back" />
        <SportsBingoSelectBoard />
      </div>
    </PageShell>
  );
}
