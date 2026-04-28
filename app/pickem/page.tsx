import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import { PickEmSportSelect } from "@/components/pickem/PickEmSportSelect";

export default function PickEmPage() {
  return (
    <PageShell title="" showPageTitle={false}>
      <div className="h-full space-y-3 overflow-y-auto">
        <BackButton label="Back to Venue Home" venueHomeFallback preferHref />
        <PickEmSportSelect />
      </div>
    </PageShell>
  );
}
