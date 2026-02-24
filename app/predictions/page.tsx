import { PageShell } from "@/components/ui/PageShell";
import { PredictionMarketList } from "@/components/predictions/PredictionMarketList";
import { SlotAd } from "@/components/ui/SlotAd";

export default async function PredictionsPage() {
  return (
    <PageShell
      title="Predictions"
      description="Browse live Polymarket markets, filter by category, and place picks."
    >
      <div className="space-y-4">
        <SlotAd slot="inline-content" />
        <PredictionMarketList />
        <SlotAd slot="mid-content" />
      </div>
    </PageShell>
  );
}
