import { PageShell } from "@/components/ui/PageShell";
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
      backTo={{ href: backHref, label: "Back", preferHref: true }}
    >
      <div className="h-full space-y-4 overflow-y-auto pr-1">
        <SportsBingoSelectGame />
      </div>
    </PageShell>
  );
}
