"use client";

export type AdminMode = "desktop" | "mobile";

type AdminModeChooserProps = {
  onChoose: (mode: AdminMode) => void;
};

export function AdminModeChooser({ onChoose }: AdminModeChooserProps) {
  return (
    /* `h-full overflow-y-auto`, not `min-h-[100svh]`: like the two shells, this
       renders inside AppShell's `fixed inset-0 h-screen overflow-hidden` admin
       box, where the document cannot scroll. `min-h-*` would let this grow past
       the clip boundary on a short landscape phone and strand the Desktop
       button with no way to reach it. See the Phase R3 entry in
       docs/admin-mobile-run-log.md. */
    <div className="flex h-full flex-col items-center justify-center gap-8 overflow-y-auto bg-slate-900 px-6 py-12 [color-scheme:light]">
      <div className="text-center">
        <div className="mb-2 text-2xl font-bold text-white">Hightop Admin</div>
        <div className="text-sm text-slate-400">How do you want to work today?</div>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={() => onChoose("mobile")}
          className="min-h-[44px] rounded-xl bg-indigo-600 px-6 py-4 text-left text-base font-semibold text-white transition-colors hover:bg-indigo-500"
        >
          Mobile
          <span className="mt-1 block text-xs font-normal text-indigo-100">
            Venues, Game Settings, Partner Billing
          </span>
        </button>
        <button
          type="button"
          onClick={() => onChoose("desktop")}
          className="min-h-[44px] rounded-xl border border-slate-700 bg-slate-800 px-6 py-4 text-left text-base font-semibold text-white transition-colors hover:bg-slate-700"
        >
          Desktop
          <span className="mt-1 block text-xs font-normal text-slate-400">
            Full admin console
          </span>
        </button>
      </div>
      <p className="max-w-sm text-center text-xs text-slate-500">
        You can switch anytime from inside either view.
      </p>
    </div>
  );
}
