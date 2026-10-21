import type { BracketTvTeam } from "@/lib/bracketsTv";
import type { VenueScreenState } from "@/lib/venueScreen";

type BracketTvState = Extract<VenueScreenState, { mode: "bracket" }>;

type BracketTvScreenProps = {
  state: BracketTvState;
  accent: string;
};

const seeded = (team: BracketTvTeam): string => (team.seed !== null ? `${team.seed} ${team.name}` : team.name);

// March Madness on the venue TV (Phase 9b): the venue's top 10 in the bracket most people here filled
// out, the biggest upset busting brackets here, and today's games. Everything arrives in the screen's
// own poll (lib/bracketsTv.ts); this component only draws it.
export function BracketTvScreen({ state, accent }: BracketTvScreenProps) {
  const { bracket } = state;

  return (
    <div className="flex min-h-0 flex-1 gap-12 px-12 pb-10" data-testid="bracket-tv">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="mb-4 flex items-baseline justify-between gap-6">
          <p className="truncate text-5xl font-black text-white">{bracket.title}</p>
          <p className="shrink-0 text-3xl font-bold text-slate-300">
            {bracket.complete ? "Final standings" : `${bracket.entries} ${bracket.entries === 1 ? "bracket" : "brackets"} here`}
          </p>
        </div>
        <ol className="flex flex-col gap-2">
          {bracket.standings.map((row) => (
            <li
              key={`${row.rank}-${row.username}`}
              className="grid grid-cols-[5rem_1fr_auto] items-center gap-6 rounded-2xl bg-white/[0.06] px-8 py-3"
            >
              <span className="text-4xl font-black" style={{ color: row.rank <= 3 ? accent : "#cbd5e1" }}>
                {row.rank}
              </span>
              <span className="min-w-0 truncate text-4xl font-black text-white">{row.username}</span>
              <span className="text-right">
                <span className="block text-4xl font-black text-white">{row.score.toLocaleString("en-US")}</span>
                {!bracket.complete ? (
                  <span className="block text-2xl font-semibold text-slate-400">best {row.maxPossible.toLocaleString("en-US")}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex w-[52rem] shrink-0 flex-col gap-6">
        {bracket.upset ? (
          <div className="rounded-3xl border-2 px-8 py-6" style={{ borderColor: `${accent}55`, background: `${accent}14` }}>
            <p className="text-2xl font-black uppercase tracking-[0.2em]" style={{ color: accent }}>
              Upset · {bracket.upset.round}
            </p>
            <p className="mt-2 text-5xl font-black leading-tight text-white">
              {seeded(bracket.upset.winner)} over {seeded(bracket.upset.loser)}
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-300">
              Busted {bracket.upset.busted} of {bracket.upset.of} {bracket.upset.of === 1 ? "bracket" : "brackets"} here
            </p>
          </div>
        ) : null}

        {bracket.games.length > 0 ? (
          <div className="flex min-h-0 flex-col gap-2">
            <p className="text-2xl font-black uppercase tracking-[0.2em] text-slate-300">Today&apos;s games</p>
            {bracket.games.map((game, index) => (
              <div key={`${game.tipAt}-${index}`} className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl bg-white/[0.06] px-6 py-3">
                <div className="min-w-0">
                  {(["away", "home"] as const).map((side) => {
                    const team = side === "home" ? game.home : game.away;
                    const lost = game.winnerSide !== null && game.winnerSide !== side;
                    return (
                      <p key={side} className={`flex justify-between gap-4 text-3xl font-black ${lost ? "text-slate-500" : "text-white"}`}>
                        <span className="min-w-0 truncate">{seeded(team)}</span>
                        <span>{team.score ?? ""}</span>
                      </p>
                    );
                  })}
                </div>
                <p className="w-40 text-right text-2xl font-bold text-slate-300">{game.status ?? game.round}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
