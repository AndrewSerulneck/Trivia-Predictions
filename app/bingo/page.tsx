import { SportsBingoHome } from "@/components/bingo/SportsBingoHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export default function SportsBingoPage() {
  return (
    <GameLandingExperience gameKey="bingo" playLabel="Play Sports Bingo">
      <div className="space-y-4">
        <SportsBingoHome />
      </div>
    </GameLandingExperience>
  );
}
