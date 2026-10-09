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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;
  // The page is already dynamic (searchParams), so reading the UA costs nothing.
  // Inside the native app this is the app's only front door, the player sign-in
  // (docs/native-app-store-plan.md Phase 3B.1); the UA only keeps the website's
  // Home link out of the app's first paint. Browsers get the page they always did.
  const nativeAppRequest = isNativeUserAgent((await headers()).get("user-agent"));
  return (
    <div className="space-y-4">
      <JoinFlow initialVenueId={params.v ?? ""} nativeAppRequest={nativeAppRequest} />
    </div>
  );
}
