"use client";

import { useEffect, type ReactNode } from "react";
import { setScrollLock } from "@/lib/scrollLock";
import { useNativeBackHandler } from "@/components/navigation/nativeBackButton";

// AccountDrawer — the player account menu's slide-out shell, used by the venue
// hub and the in-game AppBar's AccountMenu. It owns what must be identical in
// both: the scrim, the "Menu" header + Close, the scroll lock (a swipe scrolls
// the drawer down to Sign Out, not the page behind it), and Android Back
// (components/navigation/nativeBackButton.ts: the drawer closes before the
// screen's own Back runs). What goes inside is the caller's: `children`.
// The drawer stays mounted while closed so it can slide.
export function AccountDrawer({
  open,
  onClose,
  scrollLockId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  scrollLockId: string;
  children: ReactNode;
}) {
  useEffect(() => {
    setScrollLock(scrollLockId, open, "modal");
    return () => {
      setScrollLock(scrollLockId, false);
    };
  }, [open, scrollLockId]);

  useNativeBackHandler("overlay", open ? onClose : null);

  return (
    <div
      data-tp-scroll-lock={open ? "active" : undefined}
      className={`fixed inset-0 z-[1200] ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        onClick={onClose}
        className={`tp-player-hit-target tp-player-pressable absolute inset-0 h-full w-full bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Close navigation menu"
      />

      <aside
        className={`absolute inset-y-0 left-0 w-[22rem] max-w-[92vw] overflow-y-auto overscroll-contain border-r border-ht-border-soft bg-ht-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-transform duration-200 ${
          open ? "translate-x-0 shadow-ht-modal" : "-translate-x-full shadow-ht-drawer-closed"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-black tracking-wide text-ht-fg-primary">Menu</h3>
          <button
            type="button"
            onClick={onClose}
            className="tp-player-hit-target tp-player-pressable rounded-ht-sm border border-ht-border-soft bg-ht-elevated px-3 py-1.5 text-base font-semibold text-ht-fg-muted"
          >
            Close
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}
