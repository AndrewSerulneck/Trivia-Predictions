import type { ReactNode } from "react";

// A dismissible line above the dashboard's section cards: the server's note that
// a change also retired or shrank rewards pinned to a game (not an error — the
// change succeeded). It stays until dismissed because it explains a side effect.
// The success confirmation itself is a DashboardToast.

const TONE_CLASS = {
  advisory: "border-ht-amber-500/30 bg-ht-amber-500/10 text-ht-amber-200",
} as const;

export const DashboardNotice = ({
  tone,
  children,
  action,
  onDismiss,
}: {
  tone: keyof typeof TONE_CLASS;
  children: ReactNode;
  /** An underlined button after the text, e.g. "View Rewards". */
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
}) => (
  <div
    role={tone === "advisory" ? "alert" : "status"}
    className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${TONE_CLASS[tone]}`}
  >
    <span className="min-w-0 flex-1 self-center">
      {children}
      {action ? (
        <>
          {" "}
          <button type="button" onClick={action.onClick} className="min-h-11 !border-0 bg-transparent p-0 text-left underline">
            {action.label}
          </button>
        </>
      ) : null}
    </span>
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Dismiss"
      className="flex min-h-11 min-w-11 shrink-0 items-center justify-center font-black"
    >
      ×
    </button>
  </div>
);
