"use client";

import { useState } from "react";
import { GameOnboardingCard } from "@/components/venue/GameIdentityPanel";
import { VENUE_GAME_CARD_BY_KEY, type VenueGameKey } from "@/lib/venueGameCards";

export default function MockupTestPage() {
  const games: VenueGameKey[] = ["bingo", "pickem", "fantasy"];
  const [game, setGame] = useState<VenueGameKey>("bingo");
  const [step, setStep] = useState(0);
  const steps = VENUE_GAME_CARD_BY_KEY[game].steps;

  return (
    <div className="min-h-screen bg-slate-950 p-4">
      <div className="mb-3 flex gap-2">
        {games.map((g) => (
          <button key={g} onClick={() => { setGame(g); setStep(0); }} className="rounded bg-white/10 px-3 py-1 text-white">{g}</button>
        ))}
        {[0, 1, 2].map((s) => (
          <button key={s} onClick={() => setStep(s)} className="rounded bg-blue-600 px-3 py-1 text-white">step {s + 1}</button>
        ))}
      </div>
      <div className="mx-auto" style={{ width: "22.5rem" }}>
        <div className="aspect-[3/4.9]">
          <GameOnboardingCard gameKey={game} step={steps[step]} stepIndex={step} className="h-full w-full" />
        </div>
      </div>
    </div>
  );
}
