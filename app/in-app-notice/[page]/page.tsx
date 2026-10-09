import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WebOnlyNotice } from "@/components/native/WebOnlyNotice";
import { APP_WEB_ONLY_PATHS } from "@/lib/nativeLinkOut";

// What the native app shows for a web-only page (lib/nativeLinkOut.ts): proxy.ts
// rewrites an app request for `/owner/*`, `/tv` or `/admin` here, keeping the
// URL. One static page per entry, so the rewrite costs no function run, and the
// real pages stay static for every browser (docs/native-app-store-plan.md 3B.1).

export const dynamicParams = false;

export const generateStaticParams = (): { page: string }[] =>
  APP_WEB_ONLY_PATHS.map((entry) => ({ page: entry.slice(1) }));

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function InAppNoticePage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const path = APP_WEB_ONLY_PATHS.find((entry) => entry === `/${page}`);
  if (!path) notFound();
  return <WebOnlyNotice path={path} />;
}
