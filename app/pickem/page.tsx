import { PickEmGameList } from "@/components/pickem/PickEmGameList";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

export default async function PickEmPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const params = await searchParams;
  const initialSportSlug = String(params.sport ?? "").trim().toLowerCase();

  return (
    <GameLandingExperience
      gameKey="pickem"
      playLabel="Play Pick 'Em"
      initialPlaying
      autoResume={false}
      showPlayingBackButton={false}
      showShellUserStatus={false}
      showShellAlerts={false}
      playingBackgroundClassName="bg-[#020617]"
    >
      <PickEmGameList initialSportSlug={initialSportSlug} />
    </GameLandingExperience>
  );
}
