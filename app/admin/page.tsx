import { PageShell } from "@/components/ui/PageShell";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { listVenues } from "@/lib/venues";

export default async function AdminPage() {
  const venues = await listVenues();

  return (
    <PageShell
      title="Admin"
      description="Venue controls, trivia management, and ad slot management."
    >
      <AdminConsole venues={venues} />
    </PageShell>
  );
}
