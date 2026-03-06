import type { Metadata } from "next";
import { LeftHamburgerNav } from "@/components/ui/LeftHamburgerNav";
import { SlotAd } from "@/components/ui/SlotAd";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hightop Challenge",
  description: "Venue-based trivia and prediction competitions.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 touch-manipulation">
        <LeftHamburgerNav />
        <div className="relative mx-auto min-h-screen min-w-[320px] max-w-md space-y-4 overflow-hidden px-3 pb-6 pt-6 md:max-w-md">
          <div className="pointer-events-none absolute -top-20 -right-12 h-48 w-48 rounded-full bg-cyan-300/30 blur-3xl" />
          <div className="pointer-events-none absolute top-28 -left-16 h-40 w-40 rounded-full bg-blue-300/20 blur-3xl" />

          <SlotAd slot="header" />
          {children}
          <SlotAd slot="footer" />
        </div>
      </body>
    </html>
  );
}
