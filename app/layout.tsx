import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { PopupAds } from "@/components/ui/PopupAds";
import { MobileAdhesionAd } from "@/components/ui/MobileAdhesionAd";
import { GlobalTransitionOverlay } from "@/components/ui/GlobalTransitionOverlay";
import { ScrollRecoverySentinel } from "@/components/ui/ScrollRecoverySentinel";
import { ScrollRescueGuard } from "@/components/ui/ScrollRescueGuard";
import { StandalonePwaRuntime } from "@/components/ui/StandalonePwaRuntime";
import { ViewportHeightSync } from "@/components/ui/ViewportHeightSync";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import { AuthNavigationGuard } from "@/components/auth/AuthNavigationGuard";
import { LoginStuckStateBreaker } from "@/components/auth/LoginStuckStateBreaker";
import { AnalyticsRuntime } from "@/components/analytics/AnalyticsRuntime";
import { OwnerRecoveryRedirectGuard } from "@/components/owner/OwnerRecoveryRedirectGuard";
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
  openGraph: {
    type: "website",
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
  // iOS ignores the manifest's icons for the home screen and needs this
  // link tag; omitting it produces a screenshot-of-the-page icon.
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  // `apple-mobile-web-app-capable`, not the manifest, is what gives iOS a
  // chromeless standalone window. `black-translucent` extends the app under
  // the status bar, pairing with the existing viewportFit: "cover" below.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hightop",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Pins Safari's own chrome (URL bar, keyboard accessory strip) to the app's
  // dark base instead of letting it sample page content color — see Finding F
  // in docs/category-blitz-app-feel-plan.md, where an untinted accessory bar
  // was the last non-DOM source of the reported magenta band.
  themeColor: "#020617",
  // Android Chrome's default (resizes-visual) leaves the layout viewport full
  // height when the keyboard opens, so fixed-position frames sized off
  // visualViewport never see it shrink. This makes Android match the iOS
  // visualViewport-driven behavior the frame code already assumes.
  interactiveWidget: "resizes-content",
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
        {/* Next's `appleWebApp` metadata only emits the modern unprefixed
            `mobile-web-app-capable`, which WebKit only honors from iOS
            17.4+. Pre-17.4 iOS needs this legacy name to get the chromeless
            standalone window. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="touch-manipulation m-0 p-0 min-h-screen w-full">
        <AuthSessionProvider>
          <AnimationTriggerProvider>
            <OwnerRecoveryRedirectGuard />
            <AppShell legalNotice={GLOBAL_LEGAL_NOTICE}>{children}</AppShell>
            <Suspense fallback={null}>
              <AuthNavigationGuard />
            </Suspense>
            <LoginStuckStateBreaker />
            <ScrollRecoverySentinel />
            <ScrollRescueGuard />
            <StandalonePwaRuntime />
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
