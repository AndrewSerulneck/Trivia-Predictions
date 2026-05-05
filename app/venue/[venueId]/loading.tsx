export default function VenueLoading() {
  return (
    <div className="fixed inset-x-0 bottom-0 top-[calc(env(safe-area-inset-top)+4.35rem)] z-10 flex min-h-0 flex-col items-center justify-center overflow-hidden px-4 sm:top-[calc(env(safe-area-inset-top)+5.1rem)]">
      <div className="w-full max-w-sm rounded-[1.35rem] border-[2px] border-slate-900/70 bg-[linear-gradient(168deg,#f8fafc_0%,#e2e8f0_100%)] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.28)]">
        <p className="text-center text-xs font-black uppercase tracking-[0.14em] text-slate-700">Loading Venue Home</p>
        <p className="mt-3 text-center text-sm text-slate-700">Preparing your games and leaderboard...</p>
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
          <span className="block h-full w-1/2 animate-pulse rounded-full bg-[linear-gradient(90deg,#0ea5e9_0%,#2563eb_48%,#7c3aed_100%)]" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white/85" />
          <div className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white/85" />
          <div className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white/85" />
          <div className="h-14 animate-pulse rounded-xl border border-slate-200 bg-white/85" />
        </div>
      </div>
    </div>
  );
}
