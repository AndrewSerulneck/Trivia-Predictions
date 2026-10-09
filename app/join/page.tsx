import type { Metadata } from "next";
import { headers } from "next/headers";
import { JoinFlow } from "@/components/join/JoinFlow";
import { isNativeUserAgent } from "@/lib/nativeApp";

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
  // Same as `/`: the app's first paint never shows the website's Home link (Phase 3B.1).
  const nativeAppRequest = isNativeUserAgent((await headers()).get("user-agent"));
  return <JoinFlow initialVenueId={params.v ?? ""} nativeAppRequest={nativeAppRequest} />;
}
