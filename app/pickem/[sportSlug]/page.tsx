import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import { PickEmGameList } from "@/components/pickem/PickEmGameList";

export default async function PickEmSportPage({
  params,
}: {
  params: Promise<{ sportSlug: string }>;
}) {
  const { sportSlug } = await params;

  return (
    <PageShell title="" showPageTitle={false}>
      <div className="h-full space-y-3 overflow-y-auto">
        <BackButton href="/pickem" label="Back" preferHref />
        <PickEmGameList sportSlug={sportSlug} />
      </div>
    </PageShell>
  );
}
