import { getActiveAdForSlot } from "@/lib/ads";
import type { AdSlot } from "@/types";
import { AdBanner } from "@/components/ui/AdBanner";

export async function SlotAd({ slot, venueId }: { slot: AdSlot; venueId?: string }) {
  const ad = await getActiveAdForSlot(slot, venueId);
  if (!ad) {
    return null;
  }

  return <AdBanner ad={ad} />;
}
