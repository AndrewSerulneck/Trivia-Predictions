import { Suspense } from "react";
import { SportsBingoHome } from "@/components/bingo/SportsBingoHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export default async function SportsBingoPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; cardId?: string }>;
}) {
  const params = await searchParams;
  const initialDate = String(params.date ?? "").trim();
  const initialCardId = String(params.cardId ?? "").trim();

  return (
    <GameLandingExperience gameKey="bingo" playLabel="Play Sports Bingo" playHref="/bingo/home">
      <Suspense fallback={null}>
        <SportsBingoHome initialDate={initialDate} initialCardId={initialCardId} />
      </Suspense>
    </GameLandingExperience>
  );
}
