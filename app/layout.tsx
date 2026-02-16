import type { Metadata } from "next";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { SlotAd } from "@/components/ui/SlotAd";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trivia Predictions",
  description: "Venue-based trivia and prediction competitions.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-screen max-w-6xl space-y-4 px-4 pb-24 pt-6 sm:px-6 sm:pb-6">
          <SlotAd slot="header" />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>{children}</div>
            <aside className="hidden lg:block">
              <div className="sticky top-4">
                <SlotAd slot="sidebar" />
              </div>
            </aside>
          </div>

          <SlotAd slot="footer" />
        </div>
        <MobileBottomNav />
      </body>
    </html>
  );
}
