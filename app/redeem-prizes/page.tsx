import { PrizeWalletPanel } from "@/components/prizes/PrizeWalletPanel";
import { PageShell } from "@/components/ui/PageShell";
import { VenuePresenceBoundary } from "@/components/venue/VenuePresenceBoundary";

export default function RedeemPrizesPage() {
  return (
    <PageShell title="" showPageTitle={false} backTo={{ label: "Back", venueHomeFallback: true }}>
      <div className="space-y-3">
        <h1 className="ht-h1">
          Redeem Prizes
        </h1>
        <VenuePresenceBoundary>
          <PrizeWalletPanel />
        </VenuePresenceBoundary>
      </div>
    </PageShell>
  );
}
