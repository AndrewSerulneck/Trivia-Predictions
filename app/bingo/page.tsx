import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import { SportsBingoHome } from "@/components/bingo/SportsBingoHome";
import { APP_PAGE_NAMES } from "@/lib/pageNames";

export default function SportsBingoPage() {
  return (
    <PageShell
      title={APP_PAGE_NAMES.sportsBingo}
      description="Your Sports Bingo home for active board previews and quick access to create new cards."
    >
      <div className="h-full space-y-4 overflow-y-auto pr-1">
        <BackButton href="/" label="Back to Venue Home" preferHref venueHomeFallback />
        <SportsBingoHome />
      </div>
    </PageShell>
  );
}
