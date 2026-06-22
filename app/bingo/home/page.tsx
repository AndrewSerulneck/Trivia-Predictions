import { SportsBingoHome } from "@/components/bingo/SportsBingoHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export default async function SportsBingoHomePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; cardId?: string }>;
}) {
  const params = await searchParams;
  const initialDate = String(params.date ?? "").trim();
  const initialCardId = String(params.cardId ?? "").trim();

  return (
    <GameLandingExperience
      gameKey="bingo"
      initialPlaying
      playingHidesShellNav
      playingContainerClassName="p-0"
    >
      <SportsBingoHome initialDate={initialDate} initialCardId={initialCardId} />
    </GameLandingExperience>
  );
}
