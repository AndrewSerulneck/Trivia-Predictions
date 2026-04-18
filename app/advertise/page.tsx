import { AdvertisingIntakeForm } from "@/components/ads/AdvertisingIntakeForm";
import { BackButton } from "@/components/navigation/BackButton";
import { PageShell } from "@/components/ui/PageShell";

export default function AdvertisePage() {
  return (
    <PageShell
      title="Advertise With Hightop Challenge"
      description="Tell us about your interest in advertising. Name, email, and phone are required."
      showUserStatus={false}
      showAlerts={false}
    >
      <div className="space-y-4">
        <BackButton label="Back" />
        <p className="text-sm text-slate-700">
          Fill out this quick intake form and our team will follow up.
        </p>
        <AdvertisingIntakeForm />
      </div>
    </PageShell>
  );
}
