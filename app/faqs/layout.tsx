import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Player FAQs",
  description:
    "Answers about how Hightop Challenge works, how players earn points, what games are available, and how venue-based competition and prizes are structured.",
  alternates: {
    canonical: "/faqs",
  },
  openGraph: {
    type: "article",
    url: "/faqs",
    title: "Hightop Challenge Player FAQs",
    description:
      "Answers about points, prizes, venue-based gameplay, live trivia, speed trivia, sports bingo, pick'em, and fantasy sports.",
  },
  twitter: {
    card: "summary",
    title: "Hightop Challenge Player FAQs",
    description:
      "Answers about points, prizes, venue-based gameplay, live trivia, speed trivia, sports bingo, pick'em, and fantasy sports.",
  },
};

export default function FaqsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
