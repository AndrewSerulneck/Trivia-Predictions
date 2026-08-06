import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminSectionBySlug } from "@/components/admin/adminSectionMeta";
import { listVenues } from "@/lib/venues";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  const venues = await listVenues();
  const deepLinked = typeof section === "string" ? getAdminSectionBySlug(section) : null;

  return (
    <AdminShell
      venues={venues}
      initialSection={deepLinked?.id}
      deepLinked={Boolean(deepLinked)}
    />
  );
}
