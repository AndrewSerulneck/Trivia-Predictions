import { BackButton } from "@/components/navigation/BackButton";
import { PageShell } from "@/components/ui/PageShell";

export default function PendingChallengesPage() {
  return (
    <PageShell title="" showPageTitle={false}>
      <div className="space-y-2">
        <BackButton label="Back" venueHomeFallback />

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Challenge Inbox</h2>
          <p className="mt-1 text-sm text-slate-700">
            Accept or decline head-to-head game invitations from other players.
          </p>
          <p className="mt-2 text-sm text-slate-700">
            This is where users will receive and respond to head-to-head challenges for Pick &apos;Em, Fantasy, and
            future challenge-based games.
          </p>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-800">No pending challenges right now.</p>
            <p className="mt-1 text-xs text-slate-600">
              When players challenge you, requests will appear here with Accept and Decline actions.
            </p>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
