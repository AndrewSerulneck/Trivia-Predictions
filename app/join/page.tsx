import type { Metadata } from "next";
import { JoinFlow } from "@/components/join/JoinFlow";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;
  return <JoinFlow initialVenueId={params.v ?? ""} />;
}
