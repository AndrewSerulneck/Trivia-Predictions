import { GameLandingExperience } from "@/components/venue/GameLandingExperience";
import { ScategoriesGame } from "@/components/scategories/ScategoriesGame";

export default function ScategoriesPlayPage() {
  return (
    <GameLandingExperience
      gameKey="scategories"
      playLabel="Join Game"
      initialPlaying
      playingHidesShellNav
      playingContainerClassName="p-0"
    >
      <ScategoriesGame />
    </GameLandingExperience>
  );
}
