import type { Metadata, Viewport } from "next";
import { PopupAds } from "@/components/ui/PopupAds";
import { MobileAdhesionAd } from "@/components/ui/MobileAdhesionAd";
import { GlobalTransitionOverlay } from "@/components/ui/GlobalTransitionOverlay";
import { ScrollRecoverySentinel } from "@/components/ui/ScrollRecoverySentinel";
import { ViewportHeightSync } from "@/components/ui/ViewportHeightSync";
import { LayoutDebugProbe } from "@/components/ui/LayoutDebugProbe";
import "./globals.css";

const GLOBAL_LEGAL_NOTICE =
  "Use of this platform is restricted to authorized, geofenced locations. To inquire about becoming an activated venue or to obtain a commercial license for your establishment, please contact partnerships@hightopchallenge.com.";

export const metadata: Metadata = {
  title: "Hightop Challenge",
  description: "Venue-based trivia and prediction competitions.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/brand/hightop-logo.svg" as="image" fetchPriority="high" />
      </head>
      <body className="touch-manipulation">
        <div
          className="tp-app-shell relative mx-auto grid min-h-[100svh] w-full max-w-[720px] box-border grid-rows-[1fr_auto] gap-4 overflow-x-hidden overflow-y-visible px-2 pb-24 sm:px-3"
          style={{ minHeight: "var(--tp-vh, 100svh)" }}
        >
          <div className="pointer-events-none absolute -top-20 -right-12 h-52 w-52 rounded-full bg-orange-300/40 blur-3xl" />
          <div className="pointer-events-none absolute top-24 -left-16 h-44 w-44 rounded-full bg-red-300/30 blur-3xl" />
          <div className="pointer-events-none absolute bottom-16 right-4 h-36 w-36 rounded-full bg-amber-200/35 blur-3xl" />

          <main className="min-h-0">{children}</main>
          <footer className="tp-comic-card tp-legal-card px-3 py-2 text-center text-xs leading-relaxed text-slate-700 break-words">
            {GLOBAL_LEGAL_NOTICE}
          </footer>
        </div>
        <ScrollRecoverySentinel />
        <ViewportHeightSync />
        <LayoutDebugProbe />
        <GlobalTransitionOverlay />
        <PopupAds />
        <MobileAdhesionAd />
      </body>
    </html>
  );
}
