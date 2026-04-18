import { PageShell } from "@/components/ui/PageShell";
import { PredictionMarketList } from "@/components/predictions/PredictionMarketList";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import { BackButton } from "@/components/navigation/BackButton";

export default async function PredictionsPage() {
  return (
    <PageShell
      title="Predictions"
      description="Browse live sports markets, choose a sport, then drill into leagues to place picks."
    >
      <div className="space-y-4">
        <BackButton label="Back" />
        <InlineSlotAdClient slot="inline-content" showPlaceholder={false} />
        <PredictionMarketList />
        <InlineSlotAdClient slot="mid-content" showPlaceholder={false} />
      </div>
    </PageShell>
  );
}
