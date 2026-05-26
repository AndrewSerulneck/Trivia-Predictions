export default function VenueLoading() {
  return (
    <div className="fixed inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+4.35rem)] z-10 flex min-h-0 flex-col items-center justify-center overflow-hidden px-4 sm:top-[calc(env(safe-area-inset-top)+5.1rem)]">
      <div className="w-full max-w-sm rounded-[1.35rem] border-[2px] border-ht-border-soft bg-ht-elevated p-5 shadow-[0_12px_28px_rgba(0,0,0,0.5)]">
        <p className="text-center text-xs font-black uppercase tracking-[0.14em] text-ht-fg-muted">Loading Venue Home</p>
        <p className="mt-3 text-center text-sm text-ht-fg-muted">Preparing your games and leaderboard...</p>
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-ht-border-soft">
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-[linear-gradient(90deg,#0ea5e9_0%,#2563eb_48%,#7c3aed_100%)]" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="h-14 animate-pulse rounded-ht-xl border border-ht-border-hairline bg-ht-surface" />
          <div className="h-14 animate-pulse rounded-ht-xl border border-ht-border-hairline bg-ht-surface" />
          <div className="h-14 animate-pulse rounded-ht-xl border border-ht-border-hairline bg-ht-surface" />
          <div className="h-14 animate-pulse rounded-ht-xl border border-ht-border-hairline bg-ht-surface" />
        </div>
      </div>
    </div>
  );
}
