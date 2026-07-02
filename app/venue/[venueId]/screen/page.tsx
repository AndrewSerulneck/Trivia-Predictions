import { notFound } from "next/navigation";
import { VenueScreenClient } from "@/components/venue-screen/VenueScreenClient";
import { applyVenueScreenDebugMode } from "@/lib/venueScreenDebug";
import { getVenueScreenState } from "@/lib/venueScreen";
import { parseVenueScreenDebugMode } from "@/lib/venueScreenTiming";

export default async function VenueScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ venueId: string }>;
  searchParams?: Promise<{ mode?: string | string[] }>;
}) {
  const { venueId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const debugMode = parseVenueScreenDebugMode(resolvedSearchParams.mode);
  const initialState = await getVenueScreenState(venueId);

  if (!initialState) {
    notFound();
  }

  return (
    <VenueScreenClient
      venueId={venueId}
      initialState={applyVenueScreenDebugMode(initialState, debugMode, initialState.updatedAt)}
      debugMode={debugMode}
    />
  );
}
