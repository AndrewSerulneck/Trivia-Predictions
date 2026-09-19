import { redirect } from "next/navigation";

export default async function PickEmSportPage({
  params,
  searchParams,
}: {
  params: Promise<{ sportSlug: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { sportSlug } = await params;
  const { week } = await searchParams;
  if (sportSlug.trim().toLowerCase() === "nfl") {
    const normalizedWeek = String(week ?? "").trim();
    redirect(normalizedWeek ? `/nfl-pickem?week=${encodeURIComponent(normalizedWeek)}` : "/nfl-pickem");
  }
  redirect(`/pickem?sport=${encodeURIComponent(sportSlug)}`);
}
