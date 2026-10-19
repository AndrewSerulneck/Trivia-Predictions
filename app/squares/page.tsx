import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SquaresGame } from "@/components/squares/SquaresGame";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";
import { isSquaresEnabled } from "@/lib/seasonalGames";
import { SQUARES_GAME_NAME } from "@/lib/venueGameCards";

export const metadata: Metadata = {
  title: `${SQUARES_GAME_NAME} | Hightop Challenge`,
  description: "Claim your squares. Match the score to win points.",
};

export default function SquaresPage() {
  // Off = the page does not exist (same reversible convention as the other flags).
  if (!isSquaresEnabled()) notFound();

  return (
    <GameLandingExperience
      gameKey="squares"
      playLabel="Pick your squares"
      autoResume={false}
      showShellUserStatus={false}
      showShellAlerts={false}
      playingBackgroundClassName="bg-[#052e16]"
    >
      <SquaresGame />
    </GameLandingExperience>
  );
}
