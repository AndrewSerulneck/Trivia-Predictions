import { PickEmGameList } from "@/components/pickem/PickEmGameList";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";
import { redirect } from "next/navigation";

export default async function PickEmPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string; date?: string; week?: string }>;
}) {
  const params = await searchParams;
  const initialSportSlug = String(params.sport ?? "").trim().toLowerCase();
  const initialDate = String(params.date ?? "").trim();

  // Old regular links are still reachable. Venue identity remains in the
  // existing client session; carry a useful NFL week deep link forward.
  if (initialSportSlug === "nfl") {
    const week = String(params.week ?? "").trim();
    redirect(week ? `/nfl-pickem?week=${encodeURIComponent(week)}` : "/nfl-pickem");
  }

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
