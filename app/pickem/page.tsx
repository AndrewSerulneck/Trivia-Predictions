import { PickEmGameList } from "@/components/pickem/PickEmGameList";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export default async function PickEmPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string; date?: string }>;
}) {
  const params = await searchParams;
  const initialSportSlug = String(params.sport ?? "").trim().toLowerCase();
  const initialDate = String(params.date ?? "").trim();

  return (
    <GameLandingExperience
      gameKey="pickem"
      playLabel="Make your picks"
      autoResume={false}
      showPlayingBackButton={false}
      showShellUserStatus={false}
      showShellAlerts={false}
      playingBackgroundClassName="bg-[#020617]"
    >
      <PickEmGameList initialSportSlug={initialSportSlug} initialDate={initialDate} />
    </GameLandingExperience>
  );
}
