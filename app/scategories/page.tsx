import { GameLandingExperience } from "@/components/venue/GameLandingExperience";
import { ScategoriesGame } from "@/components/scategories/ScategoriesGame";

export default function ScategoriesPage() {
  return (
    <GameLandingExperience
      gameKey="scategories"
      playLabel="Join Game"
      playHref="/scategories/play"
      playingHidesShellNav
      playingContainerClassName="p-0"
    >
      <ScategoriesGame />
    </GameLandingExperience>
  );
}
