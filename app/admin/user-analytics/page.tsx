import { AdminConsole } from "@/components/admin/AdminConsole";
import { PageShell } from "@/components/ui/PageShell";
import { listVenues } from "@/lib/venues";

export default async function AdminUserAnalyticsPage() {
  const venues = await listVenues();

  return (
    <PageShell
      title="User Analytics"
      showPageTitle={false}
      showBranding={false}
      showUserStatus={false}
    >
      <AdminConsole venues={venues} mode="section" initialSection="user-analytics" />
    </PageShell>
  );
}
