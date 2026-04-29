"use client";

import { TriviaGame } from "@/components/trivia/TriviaGame";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export function TriviaAppFrame() {
  return (
    <GameLandingExperience gameKey="trivia" playLabel="Play Trivia">
      <TriviaGame />
    </GameLandingExperience>
  );
}

