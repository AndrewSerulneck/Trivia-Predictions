import { FantasyHome } from "@/components/fantasy/FantasyHome";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";

type FantasySportParam = "nba" | "wnba" | "baseball";

function normalizeFantasySport(value: string | undefined): FantasySportParam {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "wnba" || normalized === "baseball") {
    return normalized;
  }
  return "nba";
}

export default async function FantasyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; sport?: string; entryId?: string }>;
}) {
  const params = await searchParams;
  const initialDate = String(params.date ?? "").trim();
  const initialSport = normalizeFantasySport(params.sport);
  const initialEntryId = String(params.entryId ?? "").trim();

  return (
    <GameLandingExperience gameKey="fantasy" playLabel="Play Fantasy">
      <FantasyHome defaultSport={initialSport} initialDate={initialDate} initialEntryId={initialEntryId} />
    </GameLandingExperience>
  );
}
