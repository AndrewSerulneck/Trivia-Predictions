import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import { SportsBingoSelectSport } from "@/components/bingo/SportsBingoSelectSport";

export default function SportsBingoSelectSportPage() {
  return (
    <PageShell title="">
      <div className="h-full space-y-4 overflow-y-auto pr-1">
        <BackButton href="/bingo/home" label="Back" preferHref />
        <SportsBingoSelectSport />
      </div>
    </PageShell>
  );
}
