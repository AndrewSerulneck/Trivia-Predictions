import { PageShell } from "@/components/ui/PageShell";
import { PredictionMarketList } from "@/components/predictions/PredictionMarketList";
import { BackToVenueButton } from "@/components/predictions/BackToVenueButton";
import { SlotAd } from "@/components/ui/SlotAd";

export default async function PredictionsPage() {
  return (
    <PageShell
      title="Predictions"
      description="Browse live Polymarket markets, filter by category, and place picks."
    >
      <div className="space-y-4">
        <BackToVenueButton />
        <SlotAd slot="inline-content" />
        <PredictionMarketList />
        <SlotAd slot="mid-content" />
      </div>
    </PageShell>
  );
}
