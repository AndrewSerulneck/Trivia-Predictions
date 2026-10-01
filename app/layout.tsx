import type { Metadata, Viewport } from "next";
import { Bree_Serif, Nunito } from "next/font/google";
import { Suspense } from "react";
import { PlayerRuntime } from "@/components/ui/PlayerRuntime";
import { ScrollRecoverySentinel } from "@/components/ui/ScrollRecoverySentinel";
import { ScrollRescueGuard } from "@/components/ui/ScrollRescueGuard";
import { StandalonePwaRuntime } from "@/components/ui/StandalonePwaRuntime";
import { ViewportHeightSync } from "@/components/ui/ViewportHeightSync";
import { AuthSessionProvider } from "@/components/auth/AuthSessionProvider";
import { AuthNavigationGuard } from "@/components/auth/AuthNavigationGuard";
import { LoginStuckStateBreaker } from "@/components/auth/LoginStuckStateBreaker";
import { OwnerRecoveryRedirectGuard } from "@/components/owner/OwnerRecoveryRedirectGuard";
import { AppShell } from "@/components/ui/AppShell";
import { AnimationTriggerProvider } from "@/components/animations/AnimationTriggerProvider";
import { initializeScheduledTasks } from "@/lib/scheduledTasks";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://hightopchallenge.com";

// Self-hosted at build time by `next/font`, which emits the font files from our
// own origin and preloads them from this layout. The previous
// `@import url("https://fonts.googleapis.com/...")` at the top of globals.css
// made every first load walk a three-step chain on two extra origins
// (our CSS -> fonts.googleapis.com CSS -> fonts.gstatic.com files) before text
// settled; see finding F3 in
// docs/partner-dashboard-merch-button-loader-speed-plan.md.
//
// Next 16 keeps the REAL family names here ("Bree Serif", "Nunito"), so a bare
// `font-family: "Bree Serif"` would still resolve. The reason every call site
// was moved onto the --ht-font-display / --ht-font-body tokens in globals.css
// anyway is that `next/font` also emits a metric-matched fallback face
// ("Bree Serif Fallback" / "Nunito Fallback") whose ascent/descent/width are
// adjusted to the real font. Only the `.variable` value below carries that
// fallback, so a hand-written literal family silently gives up the
// layout-shift protection it exists to provide. Go through the tokens.
// tests/fonts-contract.test.ts fails the build if a literal comes back.
const breeSerif = Bree_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-bree-serif",
});

// Nunito is a variable font: one file covers the 400/600/700/800/900 weights the
// old @import listed separately, so this is also fewer bytes than before.
const nunito = Nunito({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-nunito",
});

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
    icon: "/icon.png",
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
    <html lang="en" className={`m-0 p-0 ${breeSerif.variable} ${nunito.variable}`}>
      <head>
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
            <AppShell>{children}</AppShell>
            <Suspense fallback={null}>
              <AuthNavigationGuard />
            </Suspense>
            <LoginStuckStateBreaker />
            <ScrollRecoverySentinel />
            <ScrollRescueGuard />
            <StandalonePwaRuntime />
            <ViewportHeightSync />
            {/* The player-only runtime (gameplay animations, the venue-entry
                transition overlay, analytics and the two ad surfaces). Mounted
                through a wrapper so its code is never downloaded on /owner/* or
                /admin — see lib/playerRuntimePaths.ts and finding F5 in
                docs/partner-dashboard-merch-button-loader-speed-plan.md. Keep it
                inside AnimationTriggerProvider: AnimationOverlay reads it. */}
            <PlayerRuntime />
          </AnimationTriggerProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
