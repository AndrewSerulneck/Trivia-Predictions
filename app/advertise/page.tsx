import type { Metadata } from "next";
import { AdvertisingIntakeForm } from "@/components/ads/AdvertisingIntakeForm";
import { PageShell } from "@/components/ui/PageShell";

export const metadata: Metadata = {
  title: "Advertise With Hightop Challenge",
  description:
    "Advertising inquiry form for brands, sponsors, and venue partners interested in promotions inside Hightop Challenge experiences.",
  alternates: {
    canonical: "/advertise",
  },
  openGraph: {
    type: "website",
    url: "/advertise",
    title: "Advertise With Hightop Challenge",
    description:
      "Advertising inquiry form for brands, sponsors, and venue partners interested in promotions inside Hightop Challenge experiences.",
  },
  twitter: {
    card: "summary",
    title: "Advertise With Hightop Challenge",
    description:
      "Advertising inquiry form for brands, sponsors, and venue partners interested in promotions inside Hightop Challenge experiences.",
  },
};

export default function AdvertisePage() {
  return (
    <PageShell
      title="Advertise With Hightop Challenge"
      description="Tell us about your interest in advertising. Name, email, and phone are required."
      showUserStatus={false}
      showAlerts={false}
      showPageTitle={false}
      backTo={{ label: "Back", showLabel: true }}
    >
      <div className="space-y-4">
        <p className="text-sm text-ht-fg-secondary">
          Fill out this quick intake form and our team will follow up.
        </p>
        <AdvertisingIntakeForm />
      </div>
    </PageShell>
  );
}
