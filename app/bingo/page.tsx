import { Suspense } from "react";
import { SportsBingoHome } from "@/components/bingo/SportsBingoHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export default function SportsBingoPage() {
  return (
    <GameLandingExperience gameKey="bingo" playLabel="Play Sports Bingo" playHref="/bingo/home">
      <div className="space-y-4">
        <Suspense fallback={null}>
          <SportsBingoHome />
        </Suspense>
      </div>
    </GameLandingExperience>
  );
}
