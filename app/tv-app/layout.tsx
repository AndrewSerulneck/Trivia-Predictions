import type { Metadata } from "next";

// The Hightop Challenge TV app's pages (docs/fire-tv-app-plan.md Phase 3). Not for search engines.
export const metadata: Metadata = {
  title: "Hightop Challenge TV",
  robots: {
    index: false,
    follow: false,
  },
};

export default function TvAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
