import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import { SportsBingoSelectGame } from "@/components/bingo/SportsBingoSelectGame";
import { APP_PAGE_NAMES } from "@/lib/pageNames";

export default function SportsBingoSelectGamePage() {
  return (
    <PageShell
      title={APP_PAGE_NAMES.sportsBingo}
      showPageTitle={false}
    >
      <div className="h-full space-y-4 overflow-y-auto pr-1">
        <BackButton href="/bingo/select-sport" label="Back" preferHref />
        <SportsBingoSelectGame />
      </div>
    </PageShell>
  );
}
