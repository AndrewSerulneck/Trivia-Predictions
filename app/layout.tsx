import type { Metadata } from "next";
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
      <body className="touch-manipulation">
        <div className="relative mx-auto min-h-screen min-w-[320px] max-w-md space-y-4 overflow-hidden px-3 pb-6 pt-6 md:max-w-md">
          <div className="pointer-events-none absolute -top-20 -right-12 h-52 w-52 rounded-full bg-orange-300/40 blur-3xl" />
          <div className="pointer-events-none absolute top-24 -left-16 h-44 w-44 rounded-full bg-red-300/30 blur-3xl" />
          <div className="pointer-events-none absolute bottom-16 right-4 h-36 w-36 rounded-full bg-amber-200/35 blur-3xl" />

          <SlotAd slot="header" />
          {children}
          <SlotAd slot="footer" />
        </div>
      </body>
    </html>
  );
}
