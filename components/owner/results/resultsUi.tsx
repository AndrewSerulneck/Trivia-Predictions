import { ChevronRight } from "lucide-react";

// Small pieces shared by the Results screens (docs/partner-results-page-plan.md §4). Same look as the
// rest of the dark Partner Dashboard sheets; nothing here knows about a competition.

export const EMPTY_CLASS =
  "rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3 py-4 text-center text-sm font-semibold text-ht-muted";
export const ROW_CLASS =
  "flex w-full items-center gap-3 rounded-[14px] border border-ht-hairline bg-ht-elevated/40 p-3 text-left transition active:translate-y-px";
export const LINK_CLASS = "min-h-11 px-2 text-sm font-black text-ht-cyan-300 underline-offset-2 hover:underline";

/**
 * For a button that sits INSIDE a bordered container (a game card's body and reward lines, a standings
 * row): app/globals.css gives every bare `button` a 12%-white border, a 12px radius, its own padding and
 * a 36px min height, and only a `!` / `:not(:disabled)`-specific utility beats those (CLAUDE.md, prize
 * card note). The padding then lives on a child, so the tap target is one block.
 */
export const BARE_BUTTON_CLASS =
  "block w-full text-left !border-0 !rounded-none !bg-transparent [&:not(:disabled)]:!p-0 [&:not(:disabled)]:!min-h-0 transition active:translate-y-px";

export const Chevron = () => (
  <span className="shrink-0 text-lg text-slate-500" aria-hidden>
    ›
  </span>
);

export const ListError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className={EMPTY_CLASS}>
    <p>{message}</p>
    <button type="button" onClick={onRetry} className={`mt-1 ${LINK_CLASS}`}>
      Try again
    </button>
  </div>
);

export const ShowMore = ({ busy, onClick }: { busy: boolean; onClick: () => void }) => (
  <div className="flex justify-center">
    <button type="button" onClick={onClick} disabled={busy} className={`${LINK_CLASS} disabled:opacity-60`}>
      {busy ? "Loading…" : "Show more"}
    </button>
  </div>
);

const GROUP_HEADER_CLASS: Record<"year" | "month" | "week", string> = {
  year: "min-h-11 px-1 text-lg font-black text-ht-primary",
  month: "min-h-11 rounded-xl border border-ht-hairline bg-ht-elevated/60 px-3 font-black text-ht-primary",
  week: "min-h-11 px-2 text-sm font-black text-ht-secondary",
};

export const GroupHeader = ({
  level,
  label,
  count,
  open,
  onToggle,
}: {
  level: "year" | "month" | "week";
  label: string;
  count: string;
  open: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    aria-expanded={open}
    onClick={onToggle}
    className={`flex w-full items-center gap-2 text-left transition active:translate-y-px ${GROUP_HEADER_CLASS[level]}`}
  >
    <ChevronRight className={`h-4 w-4 shrink-0 text-ht-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
    <span className="min-w-0 flex-1 truncate">{label}</span>
    <span className="shrink-0 text-footnote font-semibold text-ht-muted">{count}</span>
  </button>
);
