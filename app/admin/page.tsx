import { PageShell } from "@/components/ui/PageShell";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { listVenues } from "@/lib/venues";

export default async function AdminPage() {
  const venues = await listVenues();

  return (
    <PageShell
      title="Admin Dashboard"
      description="Admin tools for venues, trivia, ads, and settlement."
      showBranding={false}
      showUserStatus={false}
    >
      <AdminConsole venues={venues} />
    </PageShell>
  );
}
