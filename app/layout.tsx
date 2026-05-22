import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { PopupAds } from "@/components/ui/PopupAds";
import { MobileAdhesionAd } from "@/components/ui/MobileAdhesionAd";
import { GlobalTransitionOverlay } from "@/components/ui/GlobalTransitionOverlay";
import { ScrollRecoverySentinel } from "@/components/ui/ScrollRecoverySentinel";
import { ScrollRescueGuard } from "@/components/ui/ScrollRescueGuard";
import { ViewportHeightSync } from "@/components/ui/ViewportHeightSync";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import { AuthNavigationGuard } from "@/components/auth/AuthNavigationGuard";
import { LoginStuckStateBreaker } from "@/components/auth/LoginStuckStateBreaker";
import { AppShell } from "@/components/ui/AppShell";
import { initializeScheduledTasks } from "@/lib/scheduledTasks";
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
  if (typeof window === "undefined") {
    void initializeScheduledTasks().catch((error) => {
      console.error("Failed to initialize scheduled tasks:", error);
    });
  }

  return (
    <html lang="en" className="m-0 p-0">
      <head>
        <link rel="preload" href="/brand/hightop-logo.svg" as="image" fetchPriority="high" />
      </head>
      <body className="touch-manipulation m-0 p-0 min-h-screen w-full">
        <AuthSessionProvider>
          <AppShell legalNotice={GLOBAL_LEGAL_NOTICE}>{children}</AppShell>
          <Suspense fallback={null}>
            <AuthNavigationGuard />
          </Suspense>
          <LoginStuckStateBreaker />
          <ScrollRecoverySentinel />
          <ScrollRescueGuard />
          <ViewportHeightSync />
          <GlobalTransitionOverlay />
          <PopupAds />
          <MobileAdhesionAd />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
