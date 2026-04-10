import { getActiveAdForSlot } from "@/lib/ads";
import type { AdSlot } from "@/types";
import { AdBanner } from "@/components/ui/AdBanner";

export async function SlotAd({
  slot,
  venueId,
  showPlaceholder = false,
}: {
  slot: AdSlot;
  venueId?: string;
  showPlaceholder?: boolean;
}) {
  let ad = null;
  try {
    ad = await getActiveAdForSlot(slot, venueId);
  } catch {
    ad = null;
  }
  if (!ad) {
    if (!showPlaceholder) {
      return null;
    }

    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100/80 p-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ad Placeholder</p>
        <p className="mt-1 text-lg font-semibold text-slate-700">Banner Advertisement Slot</p>
        <p className="mt-2 max-w-md text-sm text-slate-600">This is a placeholder for a venue banner ad.</p>
      </div>
    );
  }

  return <AdBanner ad={ad} />;
}
