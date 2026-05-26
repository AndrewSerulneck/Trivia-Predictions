import { getActiveAdForSlot } from "@/lib/ads";
import type { AdSlot } from "@/types";
import { AdBanner } from "@/components/ui/AdBanner";
import { lookupSlotId } from "@/lib/adSlotRegistry";

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
      <a
        href="/advertise"
        className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        aria-label="Open Hightop Challenge advertising intake form"
      >
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-ht-lg border border-dashed border-ht-border-soft bg-ht-surface p-6 text-center transition-colors hover:bg-ht-elevated">
          <span className="mb-2 rounded bg-indigo-500/15 px-2 py-1 font-mono text-sm font-bold text-indigo-300">
            {slot}
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ht-fg-muted">Ad Placeholder</p>
          <p className="mt-2 max-w-md text-sm text-ht-fg-secondary">
            To advertise on Hightop Challenge, please reach out to adinfo@hightopchallenge.com.
          </p>
        </div>
      </a>
    );
  }

  return <AdBanner ad={ad} />;
}
