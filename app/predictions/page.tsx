import { PageShell } from "@/components/ui/PageShell";
import { PredictionMarketList } from "@/components/predictions/PredictionMarketList";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";
import { BackButton } from "@/components/navigation/BackButton";
import { APP_PAGE_NAMES } from "@/lib/pageNames";

export default async function PredictionsPage() {
  return (
    <PageShell
      title={APP_PAGE_NAMES.sportsPredictions}
      description="Browse live sports markets, choose a sport, then drill into leagues to place picks."
    >
      <div className="space-y-4">
        <BackButton label="Back" />
        <InlineSlotAdClient
          slot="inline-content"
          showPlaceholder
          showPlacementDebug
          placeholderLabel="Ad Space #3101"
          placeholderDetails="Predictions page top inline slot"
        />
        <PredictionMarketList />
        <InlineSlotAdClient
          slot="mid-content"
          showPlaceholder
          showPlacementDebug
          placeholderLabel="Ad Space #3102"
          placeholderDetails="Predictions page bottom inline slot"
        />
      </div>
    </PageShell>
  );
}
