"use client";

type PickEmPointsBank = {
  localDate: string;
  totalPicks: number;
  settledPicks: number;
  pendingPicks: number;
  correctPicks: number;
  incorrectPicks: number;
  unclaimedCorrectPicks: number;
  pendingPoints: number;
  multiplierEligible: boolean;
  multiplierIfSettledNow: 1 | 2 | 3;
  collectedPointsToday: number;
};

export function PointsBank(props: {
  bank: PickEmPointsBank | null;
  collecting: boolean;
  onCollect: () => void;
  disabled?: boolean;
}) {
  const bank = props.bank;
  const pendingPoints = Math.max(0, bank?.pendingPoints ?? 0);
  const settledPicks = Math.max(0, bank?.settledPicks ?? 0);
  const correctPicks = Math.max(0, bank?.correctPicks ?? 0);
  const totalPicks = Math.max(0, bank?.totalPicks ?? 0);
  const pendingPicks = Math.max(0, bank?.pendingPicks ?? 0);
  const denominator = settledPicks > 0 ? settledPicks : totalPicks;
  const collectLabel = `Collect ${pendingPoints.toLocaleString()} Points (${correctPicks}/${denominator} Correct)`;
  const statusLine = pendingPicks > 0 ? "Some picks are still pending." : "All current picks are settled.";

  return (
    <section className="mt-3 rounded-2xl border border-cyan-300/70 bg-cyan-50/90 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-700">Points Bank</p>
          <p className="text-xs font-semibold text-slate-700">{statusLine}</p>
        </div>
        <button
          type="button"
          data-pickem-bank-collect
          onClick={props.onCollect}
          disabled={props.collecting || props.disabled || pendingPoints <= 0}
          title={statusLine}
          className="tp-clean-button relative inline-flex min-h-[44px] items-center rounded-full border border-cyan-300 bg-gradient-to-r from-cyan-100 via-sky-100 to-indigo-100 px-4 py-2 text-xs font-semibold text-slate-800 shadow-[0_6px_14px_rgba(56,189,248,0.22)] transition-all hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {props.collecting ? "Collecting..." : collectLabel}
        </button>
      </div>
    </section>
  );
}
