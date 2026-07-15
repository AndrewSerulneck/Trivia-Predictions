import { NFLPickEmGameList } from "@/components/nfl-pickem/NFLPickEmGameList";
import { GameLandingExperience } from "@/components/venue/GameLandingExperience";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "NFL Pick 'Em | Hightop Challenge",
  description: "Pick NFL winners each week. That's it.",
  openGraph: {
    title: "NFL Pick 'Em | Hightop Challenge",
    description: "Pick NFL winners each week. Compete with friends and win points!",
  },
};

export default async function NFLPickEmPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  const initialWeekId = String(params.week ?? "").trim() || undefined;

  return (
    <GameLandingExperience
      gameKey="nfl-pickem"
      playLabel="Make your picks"
      autoResume={false}
      showPlayingBackButton={false}
      showShellUserStatus={false}
      showShellAlerts={false}
      playingBackgroundClassName="bg-[#020617]"
    >
      <NFLPickEmGameList initialWeekId={initialWeekId} />
    </GameLandingExperience>
  );
}
