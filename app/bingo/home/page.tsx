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
      playingContainerClassName="px-2 pb-2 sm:px-3 sm:pb-3 -mt-[1.35rem]"
    >
      <SportsBingoHome initialDate={initialDate} initialCardId={initialCardId} />
    </GameLandingExperience>
  );
}
