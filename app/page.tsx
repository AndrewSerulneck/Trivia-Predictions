import { JoinFlow } from "@/components/join/JoinFlow";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="space-y-4">
      <JoinFlow initialVenueId={params.v ?? ""} />
    </div>
  );
}
