import type { Metadata, Viewport } from "next";
import { PopupAds } from "@/components/ui/PopupAds";
import { MobileAdhesionAd } from "@/components/ui/MobileAdhesionAd";
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="touch-manipulation">
        <div className="relative mx-auto min-h-screen min-w-[320px] max-w-md space-y-4 overflow-hidden px-3 pb-24 pt-6 md:max-w-md md:pb-6">
          <div className="pointer-events-none absolute -top-20 -right-12 h-52 w-52 rounded-full bg-orange-300/40 blur-3xl" />
          <div className="pointer-events-none absolute top-24 -left-16 h-44 w-44 rounded-full bg-red-300/30 blur-3xl" />
          <div className="pointer-events-none absolute bottom-16 right-4 h-36 w-36 rounded-full bg-amber-200/35 blur-3xl" />

          {children}
          <footer className="px-1 text-center text-xs leading-relaxed text-slate-600">{GLOBAL_LEGAL_NOTICE}</footer>
        </div>
        <PopupAds />
        <MobileAdhesionAd />
      </body>
    </html>
  );
}
