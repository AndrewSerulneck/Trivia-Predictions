import { PageShell } from "@/components/ui/PageShell";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { listVenues } from "@/lib/venues";

export default async function AdminPage() {
  const venues = await listVenues();

  return (
    <PageShell
      title="Admin Dashboard"
      description="Choose a tool to open its page."
      showBranding={false}
      showUserStatus={false}
    >
      <AdminConsole venues={venues} mode="dashboard" />
    </PageShell>
  );
}
