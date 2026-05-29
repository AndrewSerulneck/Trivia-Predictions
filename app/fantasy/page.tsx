import Link from "next/link";
import { FantasyHome } from "@/components/fantasy/FantasyHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

function FantasyModeSwitch({ active }: { active: "nba" | "wnba" }) {
  return (
    <div className="rounded-2xl border border-violet-400/30 bg-slate-900 p-1.5">
      <div className="grid grid-cols-2 gap-1">
        <Link
          href="/fantasy"
          className={`rounded-xl border px-3 py-2 text-center text-sm font-semibold transition-colors ${
            active === "nba"
              ? "border-violet-400/60 bg-violet-500/20 text-violet-300"
              : "border-transparent text-slate-400 hover:border-violet-400/40 hover:bg-violet-950/40 hover:text-slate-200"
          }`}
          aria-current={active === "nba" ? "page" : undefined}
        >
          NBA Fantasy
        </Link>
        <Link
          href="/fantasy/wnba"
          className={`rounded-xl border px-3 py-2 text-center text-sm font-semibold transition-colors ${
            active === "wnba"
              ? "border-violet-400/60 bg-violet-500/20 text-violet-300"
              : "border-transparent text-slate-400 hover:border-violet-400/40 hover:bg-violet-950/40 hover:text-slate-200"
          }`}
          aria-current={active === "wnba" ? "page" : undefined}
        >
          WNBA Fantasy
        </Link>
      </div>
    </div>
  );
}

export default function FantasyPage() {
  return (
    <GameLandingExperience gameKey="fantasy" playLabel="Play Fantasy">
      <div className="space-y-3 rounded-2xl border border-violet-400/20 bg-slate-950/70 p-2">
        <FantasyModeSwitch active="nba" />
        <FantasyHome defaultSport="nba" />
      </div>
    </GameLandingExperience>
  );
}
