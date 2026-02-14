import { PageShell } from "@/components/ui/PageShell";

export default function HomePage() {
  return (
    <PageShell
      title="Trivia Predictions"
      description="Venue-based trivia and prediction competitions."
    >
      <div className="space-y-3 text-sm text-slate-700">
        <p>
          Scaffold is ready with Next.js, TypeScript, Tailwind, Supabase wiring,
          and mocked prediction markets.
        </p>
        <p>
          Next implementation step is Phase 2 database setup, then venue-locked
          join flow.
        </p>
      </div>
    </PageShell>
  );
}
