import { PageShell } from "@/components/ui/PageShell";
import { SportsBingoSelectBoard } from "@/components/bingo/SportsBingoSelectBoard";
import { VenuePresenceBoundary } from "@/components/venue/VenuePresenceBoundary";
import { APP_PAGE_NAMES } from "@/lib/pageNames";

export default async function SportsBingoSelectBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ sportKey?: string }>;
}) {
  const params = await searchParams;
  const sportKey = String(params.sportKey ?? "").trim();
  const backHref = sportKey
    ? `/bingo/select-game?sportKey=${encodeURIComponent(sportKey)}`
    : "/bingo/select-game";

  return (
    <PageShell
      title={APP_PAGE_NAMES.sportsBingo}
      showPageTitle={false}
      backTo={{ href: backHref, label: "Back", preferHref: true }}
    >
      <div className="h-full space-y-4 overflow-y-auto pr-1">
        <VenuePresenceBoundary>
          <SportsBingoSelectBoard />
        </VenuePresenceBoundary>
      </div>
    </PageShell>
  );
}
