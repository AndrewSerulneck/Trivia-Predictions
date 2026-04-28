import { BackButton } from "@/components/navigation/BackButton";
import { PageShell } from "@/components/ui/PageShell";

export default function RedeemPrizesPage() {
  return (
    <PageShell title="" showPageTitle={false}>
      <div className="space-y-2">
        <BackButton label="Back" venueHomeFallback />

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Prize Wallet</h2>
          <p className="mt-1 text-sm text-slate-700">
            This page will list earned prizes and provide redemption instructions once your venue prize program is live.
          </p>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">No prizes available yet.</p>
            <p className="mt-1 text-xs text-slate-600">
              Prize history and redemption options will appear here when weekly rewards are enabled.
            </p>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
