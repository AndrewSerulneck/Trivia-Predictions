"use client";

import { TriviaGame } from "@/components/trivia/TriviaGame";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export function TriviaAppFrame() {
  return (
    <GameLandingExperience gameKey="speed-trivia" playLabel="Play Trivia">
      <div className="flex h-full min-h-0 flex-col">
        <TriviaGame />
      </div>
    </GameLandingExperience>
  );
}
