import { FantasyHome } from "@/components/fantasy/FantasyHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export default function FantasyPage() {
  return (
    <GameLandingExperience gameKey="fantasy" playLabel="Play Fantasy">
      <FantasyHome defaultSport="nba" />
    </GameLandingExperience>
  );
}
