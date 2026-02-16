import { PageShell } from "@/components/ui/PageShell";
import { PredictionMarketList } from "@/components/predictions/PredictionMarketList";
import { SlotAd } from "@/components/ui/SlotAd";
import { getPredictionMarkets } from "@/lib/polymarket";

export default async function PredictionsPage() {
  const markets = await getPredictionMarkets();

  return (
    <PageShell
      title="Predictions"
      description="Live Polymarket markets (with automatic mock fallback when unavailable)."
    >
      <div className="space-y-4">
        <SlotAd slot="inline-content" />
        <PredictionMarketList markets={markets} />
        <SlotAd slot="mid-content" />
      </div>
    </PageShell>
  );
}
