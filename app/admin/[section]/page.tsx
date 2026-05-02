import { notFound } from "next/navigation";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { getAdminSectionBySlug } from "@/components/admin/adminSections";
import { PageShell } from "@/components/ui/PageShell";
import { listVenues } from "@/lib/venues";

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const matchedSection = getAdminSectionBySlug(section);
  if (!matchedSection) {
    notFound();
  }

  const venues = await listVenues();

  return (
    <PageShell
      title={matchedSection.label}
      showPageTitle={false}
      showBranding={false}
      showUserStatus={false}
    >
      <AdminConsole venues={venues} mode="section" initialSection={matchedSection.id} />
    </PageShell>
  );
}
