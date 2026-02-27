import { PageShell } from "@/components/ui/PageShell";

export default function HomePage() {
  return (
    <PageShell
      title="Hightop Challenge"
      description="Venue-based trivia and prediction competitions."
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          Welcome to Hightop Challenge. The core gameplay loop is live: venue-locked join flow, trivia gameplay,
          Polymarket-backed predictions, activity timeline, leaderboard, notifications, and admin tools.
        </p>
        <p>
          Current focus is production hardening and QA across migration state, settlement paths, and cross-device ad
          placement.
        </p>
      </div>
    </PageShell>
  );
}
