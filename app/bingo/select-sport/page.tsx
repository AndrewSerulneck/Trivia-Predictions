import { PageShell } from "@/components/ui/PageShell";
import { SportsBingoSelectSport } from "@/components/bingo/SportsBingoSelectSport";

export default function SportsBingoSelectSportPage() {
  return (
    <PageShell title="" backTo={{ href: "/bingo/home", label: "Back", preferHref: true }}>
      <div className="h-full space-y-4 overflow-y-auto pr-1">
        <SportsBingoSelectSport />
      </div>
    </PageShell>
  );
}
