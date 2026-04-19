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
      <a
        href="/advertise"
        className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        aria-label="Open Hightop Challenge advertising intake form"
      >
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-100/80 p-6 text-center transition-colors hover:bg-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ad Placeholder</p>
          <p className="mt-2 max-w-md text-sm text-slate-700">
            To advertise on Hightop Challenge, please reach out to adinfo@hightopchallenge.com.
          </p>
        </div>
      </a>
    );
  }

  return <AdBanner ad={ad} />;
}
