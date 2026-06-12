import { FantasyHome } from "@/components/fantasy/FantasyHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export default async function FantasyWnbaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; entryId?: string }>;
}) {
  const params = await searchParams;
  const initialDate = String(params.date ?? "").trim();
  const initialEntryId = String(params.entryId ?? "").trim();

  return (
    <GameLandingExperience gameKey="fantasy" playLabel="Play Fantasy">
      <FantasyHome defaultSport="wnba" initialDate={initialDate} initialEntryId={initialEntryId} />
    </GameLandingExperience>
  );
}
