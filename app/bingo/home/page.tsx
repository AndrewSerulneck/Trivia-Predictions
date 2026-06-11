import { SportsBingoHome } from "@/components/bingo/SportsBingoHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export default function SportsBingoHomePage() {
  return (
    <GameLandingExperience
      gameKey="bingo"
      initialPlaying
      playingContainerClassName="px-2 pb-2 sm:px-3 sm:pb-3 -mt-[1.35rem]"
    >
      <SportsBingoHome />
    </GameLandingExperience>
  );
}
