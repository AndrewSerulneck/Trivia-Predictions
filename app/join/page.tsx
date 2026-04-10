import { JoinFlow } from "@/components/join/JoinFlow";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;
  return <JoinFlow initialVenueId={params.v ?? ""} />;
}
