import { redirect } from "next/navigation";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;
  const target = params.v ? `/?v=${encodeURIComponent(params.v)}` : "/";
  redirect(target);
}
