import { PageShell } from "@/components/ui/PageShell";

export default function HomePage() {
  return (
    <PageShell
      title="Hightop Challenge"
      description="Venue-based trivia and prediction competitions."
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          Hi Dad. Welcome to Hightop Challenge! Core scaffold is live with Next.js, TypeScript, Tailwind, Supabase
          wiring, venue-locked join flow, and Polymarket-backed predictions.
        </p>
        <p>
          Next step is to connect Trivia, Activity, and Leaderboard
          pages to live Supabase data instead of placeholder content.
        </p>
      </div>
    </PageShell>
  );
}
