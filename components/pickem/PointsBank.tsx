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
  const multiplierEligible = bank?.multiplierEligible ?? true;
  const denominator = settledPicks > 0 ? settledPicks : totalPicks;
  const collectLabel = `Collect ${pendingPoints.toLocaleString()} Points (${correctPicks}/${denominator} Correct)`;
  const progressToTen = Math.max(0, Math.min(100, (correctPicks / 10) * 100));
  const hitSeven = correctPicks >= 7;
  const hitTen = correctPicks >= 10;
  const warning =
    pendingPicks > 0
      ? "Warning: Collecting now forfeits your chance at 2x or 3x multipliers for today's picks!"
      : "All current picks are settled.";

  return (
    <section className="mt-3 rounded-2xl border border-cyan-300/70 bg-cyan-50/90 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-cyan-700">Points Bank</p>
          <p className="text-xs font-semibold text-slate-700">
            {multiplierEligible
              ? `Multiplier active${bank ? ` · Live target ${bank.multiplierIfSettledNow}x` : ""}`
              : "Multiplier forfeited for this day"}
          </p>
        </div>
        <button
          type="button"
          data-pickem-bank-collect
          onClick={props.onCollect}
          disabled={props.collecting || props.disabled || pendingPoints <= 0}
          title={warning}
          className="tp-clean-button relative inline-flex min-h-[44px] items-center rounded-full border border-amber-500 bg-gradient-to-r from-amber-300 via-amber-200 to-yellow-200 px-4 py-2 text-xs font-black text-amber-900 shadow-[0_5px_16px_rgba(217,119,6,0.30)] transition-all hover:brightness-105 active:scale-95 disabled:opacity-60"
        >
          {props.collecting ? "Collecting..." : collectLabel}
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-cyan-200 bg-white/80 p-2">
        <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
          <span>Multiplier Progress</span>
          <span>{correctPicks}/10 Correct</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-slate-200">
          <div className="absolute inset-y-0 left-0 bg-cyan-400 transition-all" style={{ width: `${progressToTen}%` }} />
          <div className="absolute inset-y-0 left-[70%] w-px bg-slate-400/60" />
          <div className="absolute inset-y-0 left-[100%] w-px bg-slate-500/80" />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] font-semibold text-slate-600">
          <span className={hitSeven ? "text-cyan-700" : "text-slate-500"}>7/10 = 2x</span>
          <span className={hitTen ? "text-cyan-700" : "text-slate-500"}>10/10 = 3x</span>
        </div>
      </div>

      {pendingPicks > 0 ? (
        <p className="mt-2 text-[11px] font-semibold text-amber-700">{warning}</p>
      ) : null}
    </section>
  );
}
