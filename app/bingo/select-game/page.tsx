import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import { SportsBingoSelectGame } from "@/components/bingo/SportsBingoSelectGame";
import { APP_PAGE_NAMES } from "@/lib/pageNames";

export default async function SportsBingoSelectGamePage({
  searchParams,
}: {
  searchParams: Promise<{ sportKey?: string }>;
}) {
  const params = await searchParams;
  const sportKey = String(params.sportKey ?? "").trim();
  const backHref = sportKey
    ? `/bingo/select-sport?sportKey=${encodeURIComponent(sportKey)}`
    : "/bingo/select-sport";

  return (
    <PageShell
      title={APP_PAGE_NAMES.sportsBingo}
      showPageTitle={false}
    >
      <div className="h-full space-y-4 overflow-y-auto pr-1">
        <BackButton href={backHref} label="Back" preferHref />
        <SportsBingoSelectGame />
      </div>
    </PageShell>
  );
}
