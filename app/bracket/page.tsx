import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BracketGame } from "@/components/bracket/BracketGame";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";
import { isBracketsEnabled } from "@/lib/seasonalGames";
import { BRACKET_GAME_NAME } from "@/lib/venueGameCards";

export const metadata: Metadata = {
  title: `${BRACKET_GAME_NAME} | Hightop Challenge`,
  description: "Fill out your bracket. Beat everyone at your venue.",
};

export default function BracketPage() {
  // Off = the page does not exist (same reversible convention as the other flags).
  if (!isBracketsEnabled()) notFound();

  return (
    <GameLandingExperience
      gameKey="bracket"
      playLabel="Fill out my bracket"
      autoResume={false}
      showShellUserStatus={false}
      showShellAlerts={false}
      playingBackgroundClassName="bg-[#431407]"
    >
      <BracketGame />
    </GameLandingExperience>
  );
}
