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
import { AnalyticsRuntime } from "@/components/analytics/AnalyticsRuntime";
import { AppShell } from "@/components/ui/AppShell";
import { AnimationOverlay } from "@/components/animations/AnimationOverlay";
import { AnimationTriggerProvider } from "@/components/animations/AnimationTriggerProvider";
import { initializeScheduledTasks } from "@/lib/scheduledTasks";
import "./globals.css";

const GLOBAL_LEGAL_NOTICE =
  "Use of this platform is restricted to authorized, geofenced locations. To inquire about becoming an activated venue or to obtain a commercial license for your establishment, please contact partnerships@hightopchallenge.com.";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://hightopchallenge.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Hightop Challenge",
    template: "%s | Hightop Challenge",
  },
  description:
    "Browser-based venue gaming for bars and restaurants with live trivia, speed trivia, sports bingo, pick'em, fantasy sports, and venue-scoped challenges.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Hightop Challenge",
    title: "Hightop Challenge",
    description:
      "Browser-based venue gaming for bars and restaurants with live trivia, speed trivia, sports bingo, pick'em, fantasy sports, and venue-scoped challenges.",
    images: [
      {
        url: "/brand/hero-poster.jpg",
        width: 1200,
        height: 630,
        alt: "Hightop Challenge venue gaming platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hightop Challenge",
    description:
      "Browser-based venue gaming for bars and restaurants with live trivia, speed trivia, sports bingo, pick'em, fantasy sports, and venue-scoped challenges.",
    images: ["/brand/hero-poster.jpg"],
  },
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
          <AnimationTriggerProvider>
            <AppShell legalNotice={GLOBAL_LEGAL_NOTICE}>{children}</AppShell>
            <Suspense fallback={null}>
              <AuthNavigationGuard />
            </Suspense>
            <LoginStuckStateBreaker />
            <ScrollRecoverySentinel />
            <ScrollRescueGuard />
            <ViewportHeightSync />
            <AnimationOverlay />
            <GlobalTransitionOverlay />
            <AnalyticsRuntime />
            <PopupAds />
            <MobileAdhesionAd />
          </AnimationTriggerProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
