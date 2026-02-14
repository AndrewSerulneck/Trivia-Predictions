import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trivia Predictions",
  description: "Venue-based trivia and prediction competitions.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-6">
          {children}
        </div>
      </body>
    </html>
  );
}
