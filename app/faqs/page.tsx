"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BackButton } from "@/components/navigation/BackButton";
import { PageShell } from "@/components/ui/PageShell";

type GameSubsection = {
  title: string;
  description: string;
};

type FaqItem = {
  question: string;
  answer?: string;
  games?: GameSubsection[];
};

// FAQ CONTENT EDIT POINT:
// Add, remove, or edit Q&A entries in this array.
const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is Hightop Challenge?",
    answer:
      "Hightop Challenge turns your favorite bar or venue into a competitive gaming arena. Compete against everyone else in the room across trivia, sports, and more — all from your phone. Earn points, climb the leaderboard, and win real prizes from the venue by winning challenges.",
  },
        {
    question: "What are Rewards and why should I care?",
    answer:
      "Rewards are goals set by your venue. Each one has a target, like 'Earn 500 points in Live Trivia this week.' When you reach the target, you win the prize tied to that reward — a discounted menu item or a gift card."
  },
  {
    question: "How do I earn points?",
    answer:
      "Points come from playing the games on the home page. Correct trivia answers, accurate sports picks, strong fantasy lineups, and bingo hits all add to your total. Every point goes toward your total score and gets you closer to winning challenges (and prizes).",
  },
        {
    question: "Prizes, you say?",
    answer:
      "Yes, prizes! Each venue offers its own Rewards. Check your venue's home screen and go to the 'Rewards' panel to see what you can win.",
  },

  {
    question: "What games are available?",
    games: [
      {
        title: "Category Blitz",
        description:
          "A competitive, fast-paced trivia game where players must name items in a category that start with a given letter. Each round has 12 categories and a 3-minute time limit. Points are awarded for unique answers. But watch out, sometimes the rules can flip to 'Majority Rules' mode, where popular answers score more points.",
      },
      {
        title: "Live Trivia",
        description:
          "Classic bar trivia where everyone in the room plays together at the same time. Games are scheduled by the host venue at set times every week. Questions appear on your phone and you type in your answer.",
      },
      {
        title: "Speed Trivia",
        description:
          "A solo trivia game available any time. Multiple-choice questions across any topic. Jump in for a quick round whenever you want and earn extra points.",
      },
            {
        title: "Pick'em",
        description:
          "Think you know who's going to win today's games? Prove it, and let your sports knowledge earn you points. Picks settle automatically the moment games end, and your points follow shortly after.",
      },
      {
        title: "Sports Bingo",
        description:
          "You get a bingo card filled with live NFL, NBA, WNBA, or MLB prop squares — things like \"LeBron scores 25+ points\" or \"Yankees record 8 strikeouts.\" Squares resolve automatically in near-real time as games happen.",
      },
      {
        title: "Fantasy Sports",
        description:
          "Draft a fresh roster every day from players who are actually playing on TV. The better your roster performs, the more points you earn.",
      },
    ],
  },
      {
    question: "Is it free to play?",
    answer:
      "Yes — Hightop Challenge is completely free. If you're reading this, it means you've already created an account and you have a username, so you can start playing immediately. No subscription, no entry fee.",
  },
  {
    question: "Can I play at more than one venue?",
    answer:
      "Yes. Your account is global, but each venue has its own independent leaderboard and challenges. Joining a second venue starts a fresh score there — it doesn't affect your standing at your first venue.",
  },
];

export default function FaqsPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <PageShell title="FAQs" description="Quick answers for players." showPageTitle={false}>
      <div className="space-y-3">
        <BackButton label="Back" venueHomeFallback />
        <section className="space-y-3">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <article key={item.question} className="rounded-ht-2xl border border-ht-border-hairline bg-ht-elevated overflow-hidden">
                <button
                  onClick={() => toggle(index)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <h2 className="text-xl font-semibold text-ht-fg-primary">{item.question}</h2>
                  <ChevronDown
                    className={`shrink-0 text-ht-fg-secondary transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    size={22}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    {item.answer && (
                      <p className="text-lg leading-7 text-ht-fg-secondary">{item.answer}</p>
                    )}
                    {item.games && (
                      <div className="space-y-3">
                        {item.games.map((game) => (
                          <div key={game.title} className="rounded-ht-xl border border-ht-border-hairline bg-ht-surface p-3">
                            <p className="text-base font-semibold text-ht-fg-primary">{game.title}</p>
                            <p className="mt-1 text-lg leading-7 text-ht-fg-secondary">{game.description}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      </div>
    </PageShell>
  );
}
