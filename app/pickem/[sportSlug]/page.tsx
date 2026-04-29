import { redirect } from "next/navigation";

export default async function PickEmSportPage({
  params,
}: {
  params: Promise<{ sportSlug: string }>;
}) {
  const { sportSlug } = await params;
  redirect(`/pickem?sport=${encodeURIComponent(sportSlug)}`);
}
