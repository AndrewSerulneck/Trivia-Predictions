import { SportsBingoHome } from "@/components/bingo/SportsBingoHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export default function SportsBingoHomePage() {
  return (
    <GameLandingExperience gameKey="bingo" initialPlaying>
      <SportsBingoHome />
    </GameLandingExperience>
  );
}
