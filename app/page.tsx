import { PageShell } from "@/components/ui/PageShell";

export default function HomePage() {
  return (
    <PageShell
      title="Trivia Predictions"
      description="Venue-based trivia and prediction competitions."
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          Core scaffold is live with Next.js, TypeScript, Tailwind, Supabase
          wiring, venue-locked join flow, and Polymarket-backed predictions.
        </p>
        <p>
          Next implementation step is connecting Trivia, Activity, and Leaderboard
          pages to live Supabase data instead of placeholder content.
        </p>
      </div>
    </PageShell>
  );
}
