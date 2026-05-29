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
    <GameLandingExperience gameKey="pickem" playLabel="Play Pick 'Em" showPlayingBackButton={false}>
      <div className="space-y-3 rounded-2xl border border-indigo-400/20 bg-slate-950/70 p-2">
        <PickEmGameList initialSportSlug={initialSportSlug} />
      </div>
    </GameLandingExperience>
  );
}
