"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ContactForm } from "@/components/info/ContactForm";
import { GameShowcaseBlock, type GameShowcase } from "@/components/info/AnnotatedScreenshot";
import { gameHref } from "@/lib/domainSplit";

// Game CTAs point at the player game, which moves to `play.` under the domain
// split — gameHref stays relative while the split is off. The apex is marketing,
// so it hosts this page and the Partner Login (/owner/login) directly.
const PLAY_HREF = gameHref("/");
const JOIN_HREF = gameHref("/join");

const TRIVIA_SHOWCASES: GameShowcase[] = [
  {
    name: "Live Trivia",
    description:
      "A trivia night that runs itself. Every guest competes together in real time — the shared energy drives rounds of drinks, keeps people seated longer, and builds the kind of weekly ritual that fills seats on your slowest nights.",
    shots: [
      {
        src: "/info/live-trivia-question.png",
        alt: "Live Trivia question screen",
        width: 750,
        height: 1484,
        callouts: [
          { x: 50, y: 25, label: "Massive question database", description: "You get access to our huge library of trivia questions across dozens of categories — fresh rounds every time." },
          { x: 22, y: 31, label: "Timed rounds", description: "Every question is a race against the clock, so the energy is always high." },
          { x: 50, y: 40, label: "Everyone answers at once", description: "Every guest at the bar answers in real time from their own phone — no pen and paper." },
        ],
      },
      {
        src: "/info/live-trivia-leaderboard.png",
        alt: "Live Trivia intermission and leaderboard",
        width: 750,
        height: 1484,
        callouts: [
          { x: 80, y: 13, label: "Built-in intermissions", description: "Scheduled breaks between rounds are the perfect window for guests to flag down a bartender for another round." },
          { x: 50, y: 42, label: "Venue-only leaderboard", description: "Standings update live and rank the players in your bar." },
          { x: 86, y: 30, label: "Guests can join anytime", description: "Each round is a new opportunity for new users to join the game. Latecomers are always welcome!" },
        ],
      },
    ],
  },
  {
    name: "Speed Trivia",
    description:
      "Solo multiple-choice trivia your guests can pick up any time they walk in. It's a built-in reason to stay one more drink — and a steady engagement layer that works even when there's no event on the calendar.",
    shots: [
      {
        src: "/info/speed-trivia.png",
        alt: "Speed Trivia multiple-choice question",
        width: 750,
        height: 1484,
        callouts: [
          { x: 27, y: 32, label: "Tap-to-answer multiple choice", description: "Simple A/B/C/D format anyone can start the moment they sit down — no host or event required." },
          { x: 17, y: 19, label: "Beat the clock", description: "A per-question countdown rewards quick thinking and pulls players back to beat their best." },
          { x: 27, y: 47, label: "Instant scoring & accuracy", description: "Immediate feedback after every answer keeps the streak — and the engagement — going." },
        ],
      },
    ],
  },
];

const SPORTS_SHOWCASES: GameShowcase[] = [
  {
    name: "Prop Bingo",
    description:
      "Every game already on your TVs becomes a promotional tool. Unique digital bingo cards are created for each player and resolve live against real NFL, NBA, WNBA, and MLB stats — giving them a personal stake in every play, every quarter, every inning. The game on screen sells the next round.",
    shots: [
      {
        src: "/info/bingo-vertical.png",
        alt: "Prop Bingo card during a live NBA game",
        width: 395,
        height: 826,
        callouts: [
          { x: 19, y: 27, label: "Auto-resolves against live stats", description: "Squares light up automatically as real game stats come in — no host, no manual tracking." },
          { x: 50, y: 34, label: "Every card is unique", description: "No two guests get the same board, so everyone is chasing a different bingo all night." },
          { x: 50, y: 54, label: "Real-time near-miss tension", description: "Live alerts like “1 away” keep eyes glued to the TV for the next stat to drop." },
        ],
      },
      {
        src: "/info/bingo-horizontal.png",
        alt: "Prop Bingo landscape view",
        width: 856,
        height: 402,
        wide: true,
        heading: "Turn your phone for the full board",
        blurb:
          "Rotate to landscape and Prop Bingo opens up into a big-screen view — the entire card, your path to bingo, and the live venue leaderboard, all in one glance.",
        callouts: [
          { x: 27, y: 52, label: "Every square at once", description: "All 25 prop squares stay on screen with no scrolling, so guests never miss a hit." },
          { x: 62, y: 38, label: "Track your path to bingo", description: "A live tracker shows how many squares you need and which line is closest." },
          { x: 80, y: 62, label: "Venue leaderboard", description: "See how you rank against everyone else in the bar, updated play by play." },
        ],
      },
    ],
  },
  {
    name: "Pick'Em",
    description:
      "A pick 'em league that all of your guests can join. The goal is simple: Look at the days matchups and pick more winners than everyone else. Just one idea: Offer a discount to the user who can predict the most winnners each week of the NFL season, then watch passive viewers turn into active competitors with a reason to come back week after week.",
    shots: [
      {
        src: "/info/pick-em.png",
        alt: "Pick'Em matchup selection screen",
        width: 750,
        height: 1484,
        callouts: [
          { x: 30, y: 42, label: "Pick the day's winners", description: "Guests check a team to lock a pick — fast, simple, and tied to the games on your screens." },
          { x: 72, y: 17, label: "Daily pick allowance", description: "A set number of daily picks keeps guests coming back day after day to use them up." },
          { x: 50, y: 29, label: "Every league you show", description: "NFL, NBA, MLB, soccer and more — run house challenges around whatever's on TV." },
        ],
      },
    ],
  },
  {
    name: "Fantasy Sports",
    description:
      "Guests choose a daily fantasy roster tied to the games you're already showing. When your patrons have skin in the game, they're not just watching — they're invested. Stack that with bar-run prizes and you've turned even low stakes NBA games into a reason for guests to stay longer and earn points and prizes.",
    shots: [
      {
        src: "/info/fantasy.png",
        alt: "Fantasy Sports roster and scoring screen",
        width: 339,
        height: 711,
        callouts: [
          { x: 50, y: 30, label: "Draft a daily roster", description: "Guests pick a lineup from the games on TV that day and earn points based on how their roster performs." },
          { x: 50, y: 45, label: "Live play by play updates", description: "Users' scores are updated in real time — and users only earn points while they're at your bar." },
          { x: 74, y: 57, label: "Bar-run prizes", description: "Tie a real reward or discount to whoever drafts the best roster that day and encourage guests to stay until the end of every game to win." },
        ],
      },
    ],
  },
];

const FEATURES = [
  { icon: "📍", title: "Drives repeat visits", body: "Every game is geofenced to your venue — it only works in your bar! Players compete with the people around them. That shared competition creates a community and keeps them coming back." },
  { icon: "🍺", title: "Longer stays, higher tabs", body: "Games keep guests engaged longer, encouraging additional food and beverage purchases with every round." },
  { icon: "📱", title: "No hardware required", body: "Players use their own phones. No tablets, no installs, no devices to buy, replace, charge, or update. No app download required." },
  { icon: "📅", title: "Schedule around your business", body: "Schedule group trivia or one of our other live community games whenever you need a boost. Target slow periods and turn them into your busiest nights." },
  { icon: "💰", title: "Advertise with us!", body: "Subscribe and broadcast your ads to our growing network of partner venues at a big discount." },
  { icon: "🎯", title: "Custom promotions & sponsorships", body: "Offer prizes to boost engagement, run sponsor integrations, or create custom challenges. Hightop gives you the tools — you set the stakes." },
];

const HOW_IT_WORKS = [
  { step: "1", title: "Guests scan the QR code", body: "Post your venue's QR code anywhere — at the bar, on tables, on a screen. No app download needed." },
  { step: "2", title: "They play on their own phones", body: "Players join instantly from their browser. Live Trivia, Sports Bingo, Pick'Em — everything runs on whatever phone is already in their pocket." },
  { step: "3", title: "They compete with each other", body: "Real-time leaderboards show who's winning. The competition is between the people actually sitting in your bar." },
  { step: "4", title: "Prizes keep them coming back", body: "Offer discounts, free rounds, or custom rewards. Winners have a reason to return — and bring friends next time." },
];

const SEMANTIC_QA = [
  {
    question: "What games are there?",
    answer:
      "Everything from classic bar trivia to live sports competitions like pick 'em leagues, fantasy sports, sports brackets, and much more. See below for a full list of products we offer. Use all of it to run promotions and drive engagement that increases revenue.",
  },
  {
    question: "How does it work?",
    answer:
      "Guests join from their phones by scanning a QR code. Gameplay is restricted to addresses you desginate — it only works when users are physically at your establishment. Players compete with the people around them for bragging rights and prizes.",
  },
  {
    question: "Is it complicated?",
    answer:
      "Not at all.  The platform is designed to be simple for both venue operators and guests. Players join by scanning a QR code, and the games run themselves. Once you subscribe, you're up and running instantly. You can schedule group games, set up challenges, and offer prizes — all from your phone.",
  },
  {
    question: "Why should I sign up?",
    answer:
      "The platform is built to increase dwell time and repeat visits. When guests are engaged in a game, they stay longer and order more. The shared experience and competitive nature of the games fosters community, creating a loyal customer base that comes back week after week.",
  },
];

export default function InfoPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");

    if (prefersReduced) {
      els.forEach((el) => el.classList.add("htm-visible"));
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("htm-visible");
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    els.forEach((el) => observerRef.current?.observe(el));

    return () => observerRef.current?.disconnect();
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {});

    const onInteraction = () => {
      v.muted = true;
      v.play().catch(() => {});
      document.removeEventListener("touchstart", onInteraction);
      document.removeEventListener("click", onInteraction);
    };
    document.addEventListener("touchstart", onInteraction, { passive: true });
    document.addEventListener("click", onInteraction, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onInteraction);
      document.removeEventListener("click", onInteraction);
    };
  }, []);

  return (
    <>
      <style>{`
        .htm-reveal {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .htm-reveal.htm-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .htm-grad {
          background: linear-gradient(135deg, #22d3ee, #818cf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .htm-btn-glow {
          box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.4);
          transition: box-shadow 0.3s ease, transform 0.15s ease;
        }
        .htm-btn-glow:hover {
          box-shadow: 0 0 24px 4px rgba(34, 211, 238, 0.3);
          transform: translateY(-1px);
        }
        .htm-card-hover {
          transition: border-color 0.2s ease, transform 0.2s ease;
        }
        .htm-card-hover:hover {
          border-color: rgba(34, 211, 238, 0.4);
          transform: translateY(-3px);
        }
        .htm-nav-blur {
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        video::-webkit-media-controls,
        video::-webkit-media-controls-start-playback-button,
        video::-webkit-media-controls-play-button {
          display: none !important;
          -webkit-appearance: none;
        }
      `}</style>

      <div className="min-h-screen bg-slate-950 text-white font-sans overflow-x-hidden">

        {/* ── NAV ── */}
        <header className="htm-nav-blur fixed top-0 left-0 right-0 z-50 border-b border-white/8 bg-slate-950/80">
          <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between gap-4">
            <Link href="/info" className="flex-shrink-0">
              <Image src="/brand/htc_logo_glow.svg" alt="Hightop Challenge" width={130} height={32} priority />
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
              <a href="#games" className="hover:text-white transition-colors">Games</a>
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
              <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
              <a href="#contact" className="hover:text-white transition-colors">Contact</a>
            </nav>
            <div className="hidden md:flex items-center gap-3 border-l border-white/10 pl-4">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Follow us</span>
              <a
                href="https://www.instagram.com/thehightopchallenge"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <a
                href="https://www.facebook.com/share/19Asg9bacc/?mibextid=wwXIfr"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </svg>
              </a>
            </div>
            <a
              href="/owner/login"
              className="hidden md:inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 htm-btn-glow"
            >
              Partner Login
            </a>
            <button
              className="md:hidden flex flex-col gap-[5px] p-2"
              aria-label="Toggle menu"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <span className={`block h-0.5 w-5 bg-white transition-transform ${mobileMenuOpen ? "translate-y-[7px] rotate-45" : ""}`} />
              <span className={`block h-0.5 w-5 bg-white transition-opacity ${mobileMenuOpen ? "opacity-0" : ""}`} />
              <span className={`block h-0.5 w-5 bg-white transition-transform ${mobileMenuOpen ? "-translate-y-[7px] -rotate-45" : ""}`} />
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden border-t border-white/8 bg-slate-950 px-5 py-6 flex flex-col gap-5 text-base font-medium">
              <a href="#games" onClick={() => setMobileMenuOpen(false)} className="text-slate-300 hover:text-white">Games</a>
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="text-slate-300 hover:text-white">Features</a>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="text-slate-300 hover:text-white">How It Works</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="text-slate-300 hover:text-white">Pricing</a>
              <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="text-slate-300 hover:text-white">Contact</a>
              <Link href={PLAY_HREF} onClick={() => setMobileMenuOpen(false)} className="text-slate-300 hover:text-white">
                Play now
              </Link>
              <a
                href="/owner/login"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 inline-flex justify-center rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950"
              >
                Partner Login
              </a>
            </div>
          )}
        </header>

        {/* ── HERO ── */}
        <section className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-16">
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url('/brand/hero-poster.jpg')" }}
          />
          <video
            ref={videoRef}
            className={`pointer-events-none absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${videoPlaying ? "opacity-100" : "opacity-0"}`}
            src="/brand/hero-video-2-compressed.mp4"
            autoPlay
            muted
            playsInline
            loop
            preload="auto"
            poster="/brand/hero-poster.jpg"
            onPlay={() => setVideoPlaying(true)}
          />
          <div className="pointer-events-none absolute inset-0 bg-slate-950/70" />

          <div className="relative mx-auto max-w-4xl px-5 py-24 text-center">
            <div className="mb-6 inline-block rounded-full border border-cyan-400/30 bg-cyan-400/8 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-cyan-300">
              Venue Entertainment Platform
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-tight tracking-tight mb-6">
              Turn Slow Nights Into
              <br />
              <span className="htm-grad">Game Nights</span>
            </h1>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-10">
              <Link
                href={JOIN_HREF}
                className="group inline-flex items-center justify-center gap-3 rounded-full bg-gradient-to-r from-cyan-400 to-cyan-500 px-10 py-5 text-lg font-black text-slate-950 htm-btn-glow shadow-lg shadow-cyan-400/25 hover:shadow-cyan-400/40 transition-all"
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-950/20">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-slate-950 ml-0.5">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </span>
                Play Hightop Challenge
              </Link>
              <a
                href="#games"
                className="group inline-flex items-center justify-center gap-3 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-8 py-4 text-base font-black text-slate-950 htm-btn-glow shadow-lg shadow-amber-400/25 hover:shadow-amber-400/40 transition-all"
              >
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-950/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-950">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                  </svg>
                </span>
                See the Games
              </a>
            </div>
            <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-4 leading-relaxed">
              Digital games that can only be accessed at your bar, played on your guests&apos; phones.
             
            </p>

          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-slate-600 text-xs">
            <span>Scroll</span>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </div>
        </section>

        {/* ── SEMANTIC QA ── */}
        <section aria-labelledby="geo-faq" className="py-24 px-5 bg-slate-900/40">
          <div className="mx-auto max-w-5xl">
            <div className="htm-reveal mb-4 text-xs font-black uppercase tracking-widest text-cyan-400" data-reveal>
              Overview
            </div>
            <h2 id="geo-faq" className="htm-reveal text-3xl sm:text-4xl font-black mb-4 max-w-3xl" data-reveal>
              What is Hightop Challenge?
            </h2>
            <p className="htm-reveal max-w-3xl text-slate-400 text-lg mb-12 leading-relaxed" data-reveal>
              Hightop Challenge is an app for businesses to run games and competitions to keep guests engaged and coming back for more. 
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {SEMANTIC_QA.map((item) => (
                <article
                  key={item.question}
                  className="htm-reveal htm-card-hover rounded-2xl border border-white/8 bg-white/3 p-7"
                  data-reveal
                >
                  <h3 className="text-xl font-black text-white mb-3">{item.question}</h3>
                  <p className="text-base text-slate-400 leading-relaxed">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── GAMES ── */}
        <section id="games" className="py-24 px-5">
          <div className="mx-auto max-w-6xl flex flex-col gap-20">

            {/* Trivia sub-section */}
            <div>
              <div className="htm-reveal mb-4 text-xs font-black uppercase tracking-widest text-cyan-400" data-reveal>
                Trivia
              </div>
              <h2 className="htm-reveal text-3xl sm:text-4xl font-black mb-3" data-reveal>
                Hosting a trivia night doesn&apos;t have to be hard or expensive. Hightop Challenge does all the work for you.
              </h2>
              {/* Trivia screenshots */}
              <div className="mt-16 flex flex-col gap-24">
                {TRIVIA_SHOWCASES.map((game) => (
                  <GameShowcaseBlock
                    key={game.name}
                    game={game}
                    descriptionSide="left"
                    id={game.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
                  />
                ))}
              </div>
            </div>

            {/* Sports sub-section */}
            <div>
              <div className="htm-reveal mb-4 text-xs font-black uppercase tracking-widest text-cyan-400" data-reveal>
                Sports
              </div>
              <h2 className="htm-reveal text-3xl sm:text-4xl font-black mb-3" data-reveal>
                Turn the games you show on TV into a promotional tool for your bar.
              </h2>
              <p className="htm-reveal text-slate-400 text-lg" data-reveal>
                Guests compete with each other for bragging rights and prizes. If users want to play, they have to come to your establishment.
              </p>
              {/* Sports screenshots */}
              <div className="mt-16 flex flex-col gap-24">
                {SPORTS_SHOWCASES.map((game) => (
                  <GameShowcaseBlock
                    key={game.name}
                    game={game}
                    descriptionSide="left"
                    id={game.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
                  />
                ))}
              </div>

              {/* More coming soon */}
              <div
                className="htm-reveal htm-card-hover mt-16 rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                data-reveal
              >
                <div>
                  <div className="text-4xl mb-4">🎮</div>
                  <h3 className="text-lg font-black text-white mb-1">More coming soon</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">New game formats are added regularly. Get in touch to learn what&apos;s next.</p>
                </div>
                <a href="#contact" className="text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors flex-shrink-0">
                  Contact us →
                </a>
              </div>
            </div>

          </div>
        </section>

        {/* ── WHY HIGHTOP ── */}
        <section id="features" className="py-24 px-5 bg-slate-900/40">
          <div className="mx-auto max-w-6xl">
            <div className="htm-reveal mb-4 text-xs font-black uppercase tracking-widest text-cyan-400" data-reveal>
              Why Bars Love Hightop Challenge
            </div>
            <h2 className="htm-reveal text-3xl sm:text-4xl font-black mb-16 max-w-2xl" data-reveal>
              Everything you need to <span className="htm-grad">grow your venue.</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="htm-reveal htm-card-hover rounded-2xl border border-white/8 bg-white/3 p-7 flex flex-col gap-3"
                  data-reveal
                >
                  <span className="text-3xl">{f.icon}</span>
                  <h3 className="text-base font-black text-white">{f.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section id="how-it-works" className="py-24 px-5">
          <div className="mx-auto max-w-4xl">
            <div className="htm-reveal mb-4 text-xs font-black uppercase tracking-widest text-cyan-400" data-reveal>
              How It Works
            </div>
            <h2 className="htm-reveal text-3xl sm:text-4xl font-black mb-16" data-reveal>
              Up and running instantly.
            </h2>
            <div className="flex flex-col gap-6">
              {HOW_IT_WORKS.map((item) => (
                <div
                  key={item.step}
                  className="htm-reveal flex gap-6 items-start"
                  data-reveal
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center text-cyan-400 font-black text-lg">
                    {item.step}
                  </div>
                  <div className="pt-1">
                    <h3 className="text-lg font-black text-white mb-1">{item.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── QUOTE CALLOUT ── */}
        <section className="py-16 px-5 bg-slate-900/40">
          <div className="mx-auto max-w-3xl text-center">
            <blockquote className="htm-reveal text-2xl sm:text-3xl font-black leading-snug text-white" data-reveal>
              &ldquo;Turn slow nights into{" "} 
              <span className="htm-grad">game nights</span>{" "}
              with Hightop Challenge.&rdquo;
            </blockquote>
          </div>
        </section>

        {/* ── PRICING ── */}
        <section id="pricing" className="py-24 px-5">
          <div className="mx-auto max-w-2xl">
            <div className="text-center mb-14">
              <div className="mb-4 text-xs font-black uppercase tracking-widest text-cyan-400">Pricing</div>
              <h2 className="htm-reveal text-3xl sm:text-4xl font-black mb-3" data-reveal>Simple, affordable pricing.</h2>
              <p className="htm-reveal text-slate-400" data-reveal>One plan. Everything included. No hidden fees.</p>
            </div>
            <div
              className="htm-reveal htm-card-hover rounded-3xl border border-cyan-400/30 bg-cyan-400/5 p-10 flex flex-col gap-8 relative"
              data-reveal
            >
              <div className="text-center">
                <div className="text-xs font-black uppercase tracking-widest text-cyan-400 mb-4">Monthly License</div>
                <div className="flex items-end justify-center gap-2 mb-2">
                  <span className="text-6xl font-black text-white">$140</span>
                  <span className="text-slate-400 mb-2 text-lg">/mo</span>
                </div>
                <p className="text-slate-500 text-sm">That&apos;s just $35 per week.</p>
              </div>
              <ul className="flex flex-col gap-4 text-sm text-slate-300">
                {[
                  "Full game library — Live Trivia, Speed Trivia, Sports Bingo, Pick'Em, Fantasy Sports",
                  "Players use their own phones — no hardware, no app download",
                  "Real-time leaderboards and venue-scoped competition",
                  "Challenge campaigns and prize tools",
                  "Custom promotions and sponsor opportunities available",
                  "Schedule games around your business hours",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span className="text-cyan-400 mt-0.5 flex-shrink-0">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href="#contact"
                className="rounded-xl bg-cyan-400 px-6 py-4 text-center text-base font-black text-slate-950 htm-btn-glow"
              >
                Get Started
              </a>
            </div>
          </div>
        </section>

        {/* ── CONTACT ── */}
        <section id="contact" className="py-24 px-5">
          <div className="mx-auto max-w-3xl">
            <div className="htm-reveal mb-4 text-xs font-black uppercase tracking-widest text-cyan-400" data-reveal>
              Get in Touch
            </div>
            <h2 className="htm-reveal text-3xl sm:text-4xl font-black mb-3" data-reveal>
              Interested in Hightop Challenge for your venue?
            </h2>
            <p className="htm-reveal text-slate-400 text-lg mb-10" data-reveal>
              Fill out the form below and we&apos;ll be in touch.
            </p>
            <div className="htm-reveal rounded-3xl border border-white/8 bg-white/3 p-8 md:p-10" data-reveal>
              <ContactForm />
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="border-t border-white/8 bg-slate-950 px-5 py-14">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
              <div className="col-span-2 md:col-span-1">
                <Image src="/brand/htc_logo_glow.svg" alt="Hightop Challenge" width={120} height={30} className="mb-4" />
                <p className="text-sm text-slate-500 leading-relaxed mb-6">
                  Venue-based social gaming for bars and restaurants.
                </p>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Follow us on social!</p>
                <div className="flex items-center gap-5">
                  <a
                    href="https://www.instagram.com/thehightopchallenge"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Hightop Challenge on Instagram"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
                    </svg>
                  </a>
                  <a
                    href="https://www.facebook.com/share/19Asg9bacc/?mibextid=wwXIfr"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Hightop Challenge on Facebook"
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                    </svg>
                  </a>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Games</h4>
                <ul className="flex flex-col gap-2 text-sm text-slate-500">
                  {[
                    ["Live Trivia", "#live-trivia"],
                    ["Speed Trivia", "#speed-trivia"],
                    ["Prop Bingo", "#prop-bingo"],
                    ["Pick'Em", "#pick-em"],
                    ["Fantasy Sports", "#fantasy-sports"],
                  ].map(([label, href]) => (
                    <li key={label}><a href={href} className="hover:text-white transition-colors">{label}</a></li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Platform</h4>
                <ul className="flex flex-col gap-2 text-sm text-slate-500">
                  {[["Features", "#features"], ["How It Works", "#how-it-works"], ["Pricing", "#pricing"], ["Player Game", "/"]].map(([label, href]) => (
                    <li key={label}><a href={href} className="hover:text-white transition-colors">{label}</a></li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Contact</h4>
                <ul className="flex flex-col gap-2 text-sm text-slate-500">
                  <li><a href="#contact" className="hover:text-white transition-colors">Contact Us</a></li>
                  <li><a href="mailto:partnerships@hightopchallenge.com" className="hover:text-white transition-colors">partnerships@hightopchallenge.com</a></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-white/8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <p>© {new Date().getFullYear()} Hightop Challenge. All rights reserved.</p>
              <p>Use restricted to authorized, geofenced venues.</p>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}
