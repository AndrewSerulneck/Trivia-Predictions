import { GameLandingExperience } from "@/components/venue/GameLandingExperience";
import { CategoryBlitzGame } from "@/components/category-blitz/CategoryBlitzGame";

export default function CategoryBlitzPage() {
  return (
    <GameLandingExperience
      gameKey="category-blitz"
      playLabel="Join Game"
      playHref="/category-blitz/play"
      skipOnboardingIfRecent
      playingHidesShellNav
      playingContainerClassName="p-0"
    >
      <CategoryBlitzGame />
    </GameLandingExperience>
  );
}
