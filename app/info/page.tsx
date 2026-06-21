"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

const GAMES = [
  { name: "Live Trivia", icon: "/brand/live_trivia_icon.png", description: "Host-run synchronized trivia nights your whole bar plays together in real time." },
  { name: "Speed Trivia", icon: "/brand/speed_trivia_icon.png", description: "Solo multiple-choice trivia available any time — no host required." },
  { name: "Sports Bingo", icon: "/brand/bingo_icon.png", description: "Bingo cards that resolve live against real NBA, WNBA, and MLB stats as games happen." },
  { name: "Pick'Em", icon: "/brand/pickem_icon.png", description: "Players pick winners from that day's games. Settle automatically when final scores come in." },
  { name: "Fantasy Sports", icon: "/brand/fantasy_icon.png", description: "Daily fantasy drafts fresh every morning — one roster per sport, per day." },
];

const FEATURES = [
  { icon: "📍", title: "Drives repeat visits", body: "Every game is scoped to your venue — players compete with the people actually in your bar. That shared competition keeps them coming back." },
  { icon: "🍺", title: "Longer stays, higher tabs", body: "Short-session game loops keep guests engaged longer, encouraging additional food and beverage purchases with every round." },
  { icon: "📱", title: "No hardware required", body: "Players use their own phones. No tablets, no installs, no devices to buy, replace, charge, or update. No app download required." },
  { icon: "📅", title: "Schedule around your business", body: "Launch live trivia, speed trivia, or other challenges whenever you need a boost. Target slow periods and turn them into your busiest nights." },
  { icon: "💰", title: "Affordable monthly licensing", body: "Flat-rate pricing with no hidden fees. Just $35 per week — less than what most venues spend on a single slow night's bar tab." },
  { icon: "🎯", title: "Custom promotions & sponsorships", body: "Offer prizes to boost engagement, run sponsor integrations, or create custom challenges. Hightop gives you the tools — you set the stakes." },
];

const HOW_IT_WORKS = [
  { step: "1", title: "Guests scan the QR code", body: "Post your venue's QR code anywhere — at the bar, on tables, on a screen. No app download needed." },
  { step: "2", title: "They play on their own phones", body: "Players join instantly from their browser. Live Trivia, Sports Bingo, Pick'Em — everything runs on whatever phone is already in their pocket." },
  { step: "3", title: "They compete with each other", body: "Real-time leaderboards show who's winning. The competition is between the people actually sitting in your bar." },
  { step: "4", title: "Prizes keep them coming back", body: "Offer discounts, free rounds, or custom rewards. Winners have a reason to return — and bring friends next time." },
];

export default function InfoPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
              <a href="mailto:partnerships@hightopchallenge.com" className="hover:text-white transition-colors">Contact</a>
            </nav>
            <a
              href="mailto:partnerships@hightopchallenge.com"
              className="hidden md:inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 htm-btn-glow"
            >
              Get in touch
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
              <a href="mailto:partnerships@hightopchallenge.com" onClick={() => setMobileMenuOpen(false)} className="text-slate-300 hover:text-white">Contact</a>
              <a
                href="mailto:partnerships@hightopchallenge.com"
                className="mt-2 inline-flex justify-center rounded-xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950"
              >
                Get in touch
              </a>
            </div>
          )}
        </header>

        {/* ── HERO ── */}
        <section className="relative min-h-screen flex flex-col justify-center overflow-hidden pt-16">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="absolute top-1/3 left-1/4 w-80 h-80 rounded-full bg-violet-500/8 blur-3xl" />
            <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-indigo-500/8 blur-3xl" />
          </div>
          <div
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{ backgroundImage: "url('/brand/stadium-lights-overlay-processed.png')", backgroundSize: "cover", backgroundPosition: "center" }}
          />

          <div className="relative mx-auto max-w-4xl px-5 py-24 text-center">
            <div className="mb-6 inline-block rounded-full border border-cyan-400/30 bg-cyan-400/8 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-cyan-300">
              Venue Entertainment Platform
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-tight tracking-tight mb-6">
              Turn Slow Nights Into{" "}
              <span className="htm-grad">Interactive Nights</span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-4 leading-relaxed">
              Real-time competition that keeps guests engaged and coming back for more.
            </p>
            <p className="text-base text-slate-500 max-w-xl mx-auto mb-10 leading-relaxed">
              Live Trivia, Sports Bingo, Pick&apos;Em, and Fantasy Sports — all scoped to your bar, played on your guests&apos; phones.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:partnerships@hightopchallenge.com"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-8 py-4 text-base font-black text-slate-950 htm-btn-glow"
              >
                Request a Demo
              </a>
              <a
                href="#games"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-4 text-base font-semibold text-white hover:bg-white/10 transition-colors"
              >
                See the Games
              </a>
            </div>
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-slate-600 text-xs">
            <span>Scroll</span>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </div>
        </section>

        {/* ── GAMES ── */}
        <section id="games" className="py-24 px-5">
          <div className="mx-auto max-w-6xl">
            <div className="htm-reveal mb-4 text-xs font-black uppercase tracking-widest text-cyan-400" data-reveal>
              The Game Library
            </div>
            <h2 className="htm-reveal text-3xl sm:text-4xl font-black mb-3" data-reveal>
              Five games. One platform.
            </h2>
            <p className="htm-reveal text-slate-400 text-lg mb-14 max-w-xl" data-reveal>
              Every game is scoped to your venue — players compete with the people actually sitting in your bar.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {GAMES.map((game) => (
                <div
                  key={game.name}
                  className="htm-reveal htm-card-hover rounded-2xl border border-white/8 bg-white/4 p-6 flex flex-col gap-4"
                  data-reveal
                >
                  <Image src={game.icon} alt={game.name} width={48} height={48} className="rounded-xl" />
                  <div>
                    <h3 className="text-lg font-black text-white mb-1">{game.name}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{game.description}</p>
                  </div>
                </div>
              ))}
              <div
                className="htm-reveal htm-card-hover rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6 flex flex-col justify-between gap-4"
                data-reveal
              >
                <div>
                  <div className="text-4xl mb-4">🎮</div>
                  <h3 className="text-lg font-black text-white mb-1">More coming soon</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">New game formats are added regularly. Get in touch to learn what&apos;s next.</p>
                </div>
                <a href="mailto:partnerships@hightopchallenge.com" className="text-sm font-bold text-cyan-400 hover:text-cyan-300 transition-colors">
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
              Why Venues Love Hightop Challenge
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
              Up and running in minutes.
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
              <span className="htm-grad">interactive nights</span>{" "}
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
                href="mailto:partnerships@hightopchallenge.com"
                className="rounded-xl bg-cyan-400 px-6 py-4 text-center text-base font-black text-slate-950 htm-btn-glow"
              >
                Get Started
              </a>
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section className="py-24 px-5 bg-slate-900/40">
          <div className="mx-auto max-w-3xl">
            <div
              className="htm-reveal relative rounded-3xl overflow-hidden border border-cyan-400/15 bg-slate-900 p-12 md:p-16 text-center"
              data-reveal
            >
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 rounded-full bg-cyan-500/12 blur-3xl" />
                <div className="absolute bottom-0 right-0 w-64 h-64 rounded-full bg-violet-500/10 blur-3xl" />
              </div>
              <div className="relative">
                <h2 className="text-3xl sm:text-4xl font-black mb-4">Ready to level up your venue?</h2>
                <p className="text-slate-400 text-lg mb-10 max-w-lg mx-auto leading-relaxed">
                  Join venues already using Hightop Challenge to create unforgettable nights and build loyal regulars.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <a
                    href="mailto:partnerships@hightopchallenge.com"
                    className="inline-flex items-center justify-center rounded-xl bg-cyan-400 px-8 py-4 text-base font-black text-slate-950 htm-btn-glow"
                  >
                    Request a Demo
                  </a>
                  <a
                    href="#games"
                    className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-8 py-4 text-base font-semibold text-white hover:bg-white/10 transition-colors"
                  >
                    Explore Games
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="border-t border-white/8 bg-slate-950 px-5 py-14">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
              <div className="col-span-2 md:col-span-1">
                <Image src="/brand/htc_logo_glow.svg" alt="Hightop Challenge" width={120} height={30} className="mb-4" />
                <p className="text-sm text-slate-500 leading-relaxed">
                  Venue-based social gaming for bars and restaurants.
                </p>
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Games</h4>
                <ul className="flex flex-col gap-2 text-sm text-slate-500">
                  {["Live Trivia", "Speed Trivia", "Sports Bingo", "Pick'Em", "Fantasy Sports"].map((g) => (
                    <li key={g}><a href="#games" className="hover:text-white transition-colors">{g}</a></li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Platform</h4>
                <ul className="flex flex-col gap-2 text-sm text-slate-500">
                  {[["Features", "#features"], ["How It Works", "#how-it-works"], ["Pricing", "#pricing"]].map(([label, href]) => (
                    <li key={label}><a href={href} className="hover:text-white transition-colors">{label}</a></li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Contact</h4>
                <ul className="flex flex-col gap-2 text-sm text-slate-500">
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
