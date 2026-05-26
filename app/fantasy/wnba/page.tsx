import Link from "next/link";
import { FantasyHome } from "@/components/fantasy/FantasyHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

function FantasyModeSwitch({ active }: { active: "nba" | "wnba" }) {
  return (
    <div className="rounded-xl border border-ht-border-soft bg-ht-elevated p-1">
      <div className="grid grid-cols-2 gap-1">
        <Link
          href="/fantasy"
          className={`rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors ${
            active === "nba"
              ? "bg-indigo-600 text-white"
              : "text-ht-fg-secondary hover:bg-ht-surface hover:text-ht-fg-primary"
          }`}
          aria-current={active === "nba" ? "page" : undefined}
        >
          NBA Fantasy
        </Link>
        <Link
          href="/fantasy/wnba"
          className={`rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors ${
            active === "wnba"
              ? "bg-indigo-600 text-white"
              : "text-ht-fg-secondary hover:bg-ht-surface hover:text-ht-fg-primary"
          }`}
          aria-current={active === "wnba" ? "page" : undefined}
        >
          WNBA Fantasy
        </Link>
      </div>
    </div>
  );
}

export default function FantasyWnbaPage() {
  return (
    <GameLandingExperience gameKey="fantasy" playLabel="Play Fantasy">
      <div className="space-y-3">
        <FantasyModeSwitch active="wnba" />
        <FantasyHome defaultSport="wnba" />
      </div>
    </GameLandingExperience>
  );
}
