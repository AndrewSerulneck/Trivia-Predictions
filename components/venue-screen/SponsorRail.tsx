import type { VenueScreenSponsorSlot, VenueScreenVenue } from "@/lib/venueScreen";

type SponsorRailProps = {
  sponsors: VenueScreenSponsorSlot[];
  venue: VenueScreenVenue;
};

export function SponsorRail({ sponsors, venue }: SponsorRailProps) {
  if (sponsors.length === 0) {
    return null;
  }

  return (
    <aside className="w-full border-t border-white/10 bg-slate-950/42 px-6 py-5 sm:px-10">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-4 lg:grid-cols-[auto_1fr] lg:gap-8">
        <p className="text-xl font-black uppercase tracking-[0.18em] text-white/48">Presented by</p>
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-3" aria-label="Venue sponsors">
          {sponsors.slice(0, 3).map((sponsor) => (
            <li
              key={`${sponsor.title}-${sponsor.imageUrl}`}
              className="flex min-h-[7.5rem] items-center gap-5 overflow-hidden rounded-lg border border-white/10 bg-white/[0.07] px-5 py-4"
            >
              <img
                src={sponsor.imageUrl}
                alt={sponsor.title}
                className="h-20 w-28 shrink-0 rounded-md object-contain"
              />
              <p className="min-w-0 text-3xl font-black leading-tight text-white">{sponsor.title}</p>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
