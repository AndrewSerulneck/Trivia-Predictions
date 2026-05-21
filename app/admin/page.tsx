import { AdminShell } from "@/components/admin/AdminShell";
import { listVenues } from "@/lib/venues";

export default async function AdminPage() {
  const venues = await listVenues();
  return <AdminShell venues={venues} />;
}
