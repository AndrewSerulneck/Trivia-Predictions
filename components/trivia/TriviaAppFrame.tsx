"use client";

import { TriviaGame } from "@/components/trivia/TriviaGame";
import { TriviaThemeScope } from "@/components/trivia/TriviaThemeScope";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export function TriviaAppFrame() {
  return (
    <>
      <TriviaThemeScope />
      <GameLandingExperience
        gameKey="speed-trivia"
        playLabel="Play Trivia"
        showShellUserStatus={false}
        playingContainerClassName="px-0 py-0"
        playingBackgroundClassName="tp-trivia-bg"
      >
        <div className="flex h-full min-h-0 flex-col">
          <TriviaGame />
        </div>
      </GameLandingExperience>
    </>
  );
}
