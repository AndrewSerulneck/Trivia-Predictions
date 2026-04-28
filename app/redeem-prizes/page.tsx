import { BackButton } from "@/components/navigation/BackButton";
import { PrizeWalletPanel } from "@/components/prizes/PrizeWalletPanel";
import { PageShell } from "@/components/ui/PageShell";

export default function RedeemPrizesPage() {
  return (
    <PageShell title="" showPageTitle={false}>
      <div className="space-y-3">
        <BackButton label="Back" venueHomeFallback />
        <PrizeWalletPanel />
      </div>
    </PageShell>
  );
}
