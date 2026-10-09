import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppFrontDoor } from "@/components/join/AppFrontDoor";
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
  // Inside the native app `/` is the app's front door (docs/native-app-store-plan.md
  // Phase 2E); every browser gets exactly the page it always did.
  const inNativeApp = isNativeUserAgent((await headers()).get("user-agent"));
  const joinFlow = <JoinFlow initialVenueId={params.v ?? ""} />;
  return <div className="space-y-4">{inNativeApp ? <AppFrontDoor>{joinFlow}</AppFrontDoor> : joinFlow}</div>;
}
