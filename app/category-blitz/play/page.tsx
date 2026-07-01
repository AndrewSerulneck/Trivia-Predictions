import { GameLandingExperience } from "@/components/venue/GameLandingExperience";
import { CategoryBlitzGame } from "@/components/category-blitz/CategoryBlitzGame";

export default function CategoryBlitzPlayPage() {
  return (
    <GameLandingExperience
      gameKey="category-blitz"
      playLabel="Join Game"
      initialPlaying
      playingHidesShellNav
      playingContainerClassName="p-0"
    >
      <CategoryBlitzGame />
    </GameLandingExperience>
  );
}
