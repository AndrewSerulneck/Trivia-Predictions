"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Menu } from "lucide-react";
import { SignOutButton } from "@/components/navigation/SignOutButton";
import { OwnerMenuDrawer } from "@/components/owner/menu/OwnerMenuDrawer";
import { OWNER_MENU_ITEMS } from "@/components/owner/menu/ownerMenuItems";
import { PartnerManual } from "@/components/owner/PartnerManual";

// ─────────────────────────────────────────────────────────────────────────────
// OwnerAppBar — the slim sticky top bar of the Partner Dashboard
// (docs/partner-dashboard-app-redesign-plan.md §4a, §4b, §4g).
//
// Leading slot: the logo menu button (opens the left drawer) — or, when a page
// passes `leading` (the dark sub-pages pass ExitBackButton), that instead. There
// is exactly one control top-left, so the drawer only exists on the dashboard.
// Centre: the title / venue switcher. Trailing: empty, reserved.
//
// This file is the SignOutButton host: Sign Out is the LAST drawer item, below a
// divider, with no arrow (navigation-unification-plan.md §0).
// ─────────────────────────────────────────────────────────────────────────────

type OwnerAppBarProps = {
  /** Replaces the logo menu button (e.g. ExitBackButton on sub-pages). */
  leading?: ReactNode;
  /** The bar's centre: a title, or the venue switcher on the dashboard. */
  children: ReactNode;
  className?: string;
};

const MENU_ROW_CLASS =
  "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ht-cyan-300";

export const OwnerAppBar = ({ leading, children, className = "" }: OwnerAppBarProps) => {
  const logoRef = useRef<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  return (
    <header
      className={`sticky top-0 z-40 border-b border-ht-hairline bg-ht-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur ${className}`}
    >
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4">
        {leading ?? (
          <button
            ref={logoRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="relative -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-ht-cyan-300"
          >
            <img
              src="/brand/HTC_Logo_Final_Transparent%20copy.png"
              alt=""
              width={36}
              height={36}
              draggable={false}
              className="h-9 w-9 select-none rounded-full object-contain"
            />
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ht-cyan-300 text-slate-950"
            >
              <Menu className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center">{children}</div>
        {/* Trailing slot intentionally empty (reserved for notifications). */}
        <span aria-hidden="true" className="h-10 w-10 shrink-0" />
      </div>

      {leading ? null : (
        <>
          <OwnerMenuDrawer
            open={menuOpen}
            onRequestClose={() => setMenuOpen(false)}
            label="Menu"
            returnFocusRef={logoRef}
          >
            <p className="px-5 pb-3 text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">Menu</p>
            <nav aria-label="Partner menu" className="flex flex-col gap-1 px-2">
              {OWNER_MENU_ITEMS.map((item) => {
                const Icon = item.icon;
                const body = (
                  <>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ht-canvas text-ht-cyan-300">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-black text-ht-primary">{item.label}</span>
                      <span className="block truncate text-xs font-semibold text-ht-muted">{item.hint}</span>
                    </span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                  </>
                );
                return item.id === "manual" ? (
                  <button
                    key={item.id}
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => {
                      setMenuOpen(false);
                      setManualOpen(true);
                    }}
                    className={MENU_ROW_CLASS}
                  >
                    {body}
                  </button>
                ) : (
                  <Link key={item.id} href={item.href} className={MENU_ROW_CLASS}>
                    {body}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 border-t border-ht-hairline px-2 pt-3">
              <SignOutButton variant="partner" />
            </div>
          </OwnerMenuDrawer>
          <PartnerManual showTrigger={false} open={manualOpen} onOpenChange={setManualOpen} returnFocusRef={logoRef} />
        </>
      )}
    </header>
  );
};
