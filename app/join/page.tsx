import { PageShell } from "@/components/ui/PageShell";
import { JoinFlow } from "@/components/join/JoinFlow";
import { BackButton } from "@/components/navigation/BackButton";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;
  return (
    <PageShell title="Join" description="Select a venue and join the game." showAlerts={false}>
      <div className="space-y-4">
        <BackButton label="Back to Join Home" href="/" />
        <JoinFlow initialVenueId={params.v ?? ""} />
      </div>
    </PageShell>
  );
}
