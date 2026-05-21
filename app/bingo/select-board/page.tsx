import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import { SportsBingoSelectBoard } from "@/components/bingo/SportsBingoSelectBoard";
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
    >
      <div className="h-full space-y-4 overflow-y-auto pr-1">
        <BackButton href={backHref} label="Back" preferHref />
        <SportsBingoSelectBoard />
      </div>
    </PageShell>
  );
}
