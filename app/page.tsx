import { JoinFlow } from "@/components/join/JoinFlow";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;
  return <JoinFlow initialVenueId={params.v ?? ""} />;
}
