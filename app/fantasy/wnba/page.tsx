import { FantasyHome } from "@/components/fantasy/FantasyHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export default function FantasyWnbaPage() {
  return (
    <GameLandingExperience gameKey="fantasy" playLabel="Play Fantasy">
      <FantasyHome defaultSport="wnba" />
    </GameLandingExperience>
  );
}
