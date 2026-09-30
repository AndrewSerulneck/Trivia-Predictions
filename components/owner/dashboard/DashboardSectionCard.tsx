import type { ReactNode } from "react";

// Shared chrome for the Partner Dashboard's two section cards
// (docs/partner-dashboard-app-redesign-plan.md §4c): the card + header, the
// skeleton, the error row, the dashed empty card and the dashed "add another" row.

// NOTE: the dashed buttons use `!` (important) modifiers because globals.css styles every
// bare <button> with an un-layered `border: 1px solid …` + 12px radius that beats plain
// Tailwind utilities — without them the "dashed" outline renders as a faint solid line.

export const DashboardSectionCard = ({
  glyph,
  accentClassName,
  title,
  addLabel,
  onAdd,
  children,
}: {
  glyph: string;
  accentClassName: string;
  title: string;
  /** aria-label for the round + button; omitted hides the button (loading / error). */
  addLabel?: string;
  onAdd?: () => void;
  children: ReactNode;
}) => (
  <section
    aria-label={title}
    className="space-y-3 rounded-2xl border border-ht-hairline bg-ht-surface p-4 shadow-ht-card"
  >
    <header className="flex items-center gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${accentClassName}`}>
        {glyph}
      </div>
      <h2 className="ht-h2 min-w-0 flex-1 truncate">{title}</h2>
      {addLabel && onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ht-cyan-500 text-2xl font-black leading-none text-slate-950 transition active:translate-y-px"
        >
          +
        </button>
      ) : null}
    </header>
    {children}
  </section>
);

export const SectionSkeleton = ({ label }: { label: string }) => (
  <div role="status" aria-label={label} className="animate-pulse space-y-2">
    <div className="h-16 rounded-[14px] bg-ht-elevated" />
    <div className="h-16 rounded-[14px] bg-ht-elevated/70" />
  </div>
);

export const SectionError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="flex items-center gap-2 rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-xs font-bold text-ht-rose-300">
    <span className="min-w-0 flex-1">{message}</span>
    <button
      type="button"
      onClick={onRetry}
      className="min-h-11 shrink-0 rounded-lg border border-ht-rose-500/40 px-3 text-xs font-black uppercase tracking-wider"
    >
      Retry
    </button>
  </div>
);

/** The whole empty card body is one button: a big + and one sentence of what it does. */
export const SectionEmpty = ({
  title,
  hint,
  onAdd,
}: {
  title: string;
  hint: string;
  onAdd: () => void;
}) => (
  <button
    type="button"
    onClick={onAdd}
    className="flex min-h-11 w-full flex-col items-center gap-2 !rounded-[14px] !border-2 !border-dashed !border-slate-500 px-4 py-8 text-center transition active:translate-y-px"
  >
    <span
      aria-hidden
      className="flex h-14 w-14 items-center justify-center rounded-full bg-ht-cyan-500 text-3xl font-black leading-none text-slate-950"
    >
      +
    </span>
    <span className="text-base font-black text-ht-primary">{title}</span>
    <span className="text-sm font-semibold text-ht-muted">{hint}</span>
  </button>
);

export const SectionAddRow = ({ label, onAdd }: { label: string; onAdd: () => void }) => (
  <button
    type="button"
    onClick={onAdd}
    className="flex min-h-12 w-full items-center justify-center !rounded-[14px] !border-2 !border-dashed !border-slate-500 px-4 text-sm font-black text-ht-cyan-300 transition active:translate-y-px"
  >
    {label}
  </button>
);

export const SectionSeeAll = ({ count, onClick }: { count: number; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="min-h-11 w-full text-center text-sm font-black text-ht-cyan-300"
  >
    See all ({count})
  </button>
);
