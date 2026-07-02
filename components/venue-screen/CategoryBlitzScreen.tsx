import { ScreenCountdown } from "@/components/venue-screen/ScreenCountdown";
import type { VenueScreenState } from "@/lib/venueScreen";

type CategoryBlitzState = Extract<VenueScreenState, { mode: "category-blitz" }>;

type CategoryBlitzScreenProps = {
  state: CategoryBlitzState;
};

export function CategoryBlitzScreen({ state }: CategoryBlitzScreenProps) {
  const blitz = state.categoryBlitz;
  const venueName = state.venue.displayName ?? state.venue.name;

  return (
    <section className="grid flex-1 grid-cols-[19rem_1fr] items-center gap-12 px-12 pb-16">
      <div className="rounded-[2rem] border border-emerald-300/18 bg-[linear-gradient(180deg,rgba(16,185,129,0.22),rgba(5,150,105,0.08))] p-8 text-center shadow-[0_30px_90px_rgba(0,0,0,0.3)]">
        <p className="text-2xl font-black uppercase tracking-[0.18em] text-white/52">{venueName}</p>
        <p className="mt-6 text-3xl font-black uppercase tracking-[0.16em] text-emerald-200">Current Letter</p>
        <p className="mt-4 text-[14rem] font-black leading-none text-white">{blitz.letter ?? "-"}</p>
        <div className="mt-6">
          <ScreenCountdown seconds={blitz.secondsRemaining} label="Round Timer" tone="cyan" />
        </div>
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.32)]">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="text-2xl font-black uppercase tracking-[0.18em] text-white/52">Category Blitz</p>
            <h2 className="mt-3 text-[clamp(3.8rem,5.2vw,6rem)] font-black leading-none text-white">
              Fill every category
            </h2>
          </div>
          <p className="rounded-lg border border-cyan-200/18 bg-cyan-200/10 px-5 py-3 text-2xl font-black uppercase tracking-[0.14em] text-cyan-100">
            {blitz.categories.length} prompts
          </p>
        </div>

        <ul className="mt-8 grid gap-4">
          {blitz.categories.map((category) => (
            <li
              key={category}
              className="rounded-2xl border border-white/10 bg-slate-950/35 px-7 py-5 text-[clamp(2.4rem,3vw,3.6rem)] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              {category}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
