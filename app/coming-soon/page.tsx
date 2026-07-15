import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Coming Soon",
  description:
    "Hightop Challenge play is coming soon. Venue games, live trivia, pick'em, fantasy sports, and more are on the way.",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function ComingSoonPage() {
  return (
    <main className="relative flex min-h-[100svh] w-full items-center overflow-hidden bg-[#050816] px-5 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(245,158,11,0.16),transparent_24%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,1))]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
      <section className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <div className="mb-9 flex items-center gap-3">
          <Image
            src="/brand/hightop-logo.svg"
            alt="Hightop Challenge"
            width={52}
            height={52}
            priority
            className="h-[52px] w-[52px]"
          />
          <span className="font-display text-2xl text-slate-50">Hightop Challenge</span>
        </div>

        <p className="mb-4 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-extrabold uppercase tracking-[0.18em] text-cyan-100">
          Play site coming soon
        </p>
        <h1 className="max-w-2xl font-display text-5xl leading-[1.02] text-slate-50 sm:text-6xl">
          FUTURE GAMES LOGIN PAGE.
        </h1>
      </section>
    </main>
  );
}
