import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import { PickEmSportSelect } from "@/components/pickem/PickEmSportSelect";
import { PickEmRecentPicks } from "@/components/pickem/PickEmRecentPicks";

export default function PickEmPage() {
  return (
    <PageShell title="" showPageTitle={false}>
      <div className="h-full space-y-3 overflow-y-auto">
        <BackButton label="Back to Venue Home" venueHomeFallback preferHref />
        <PickEmSportSelect />
        <PickEmRecentPicks />
      </div>
    </PageShell>
  );
}
