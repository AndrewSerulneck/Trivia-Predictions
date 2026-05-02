import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import { SportsBingoSelectSport } from "@/components/bingo/SportsBingoSelectSport";
import { APP_PAGE_NAMES } from "@/lib/pageNames";

export default function SportsBingoSelectSportPage() {
  return (
    <PageShell
      title={APP_PAGE_NAMES.sportsBingo}
      description="Step 1: Select the sport for your Sports Bingo card."
    >
      <div className="h-full space-y-4 overflow-y-auto pr-1">
        <BackButton href="/bingo/home" label="Back" preferHref />
        <SportsBingoSelectSport />
      </div>
    </PageShell>
  );
}
