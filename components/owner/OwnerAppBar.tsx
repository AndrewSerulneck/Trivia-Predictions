"use client";

import { Suspense, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ShoppingBag } from "lucide-react";
import { SignOutButton } from "@/components/navigation/SignOutButton";
import { OwnerMenuDrawer } from "@/components/owner/menu/OwnerMenuDrawer";
import { visibleOwnerMenuItems } from "@/components/owner/menu/ownerMenuItems";
import { PartnerManual } from "@/components/owner/PartnerManual";
import { menuHintForThisVisit } from "@/lib/ownerMenuHint";
import { parseSheetParam, pushSheet, SHEET_PARAM, type OwnerSheetId } from "@/lib/ownerSheetParams";

// ─────────────────────────────────────────────────────────────────────────────
// OwnerAppBar — the slim sticky top bar of the Partner Dashboard
// (docs/partner-dashboard-app-redesign-plan.md §4a, §4b, §4g).
//
// Leading slot: the logo menu button (opens the left drawer) — or, when a page
// passes `leading` (the dark sub-pages pass ExitBackButton), that instead. There
// is exactly one control top-left, so the drawer only exists on the dashboard.
// Centre: the title / venue switcher. Trailing: on the dashboard, the "Order Join
// Merch" button (opens the store sheet in place, like the menu row); on sub-pages an
// empty spacer so the title stays centred
// (docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 1).
//
// Menu rows that open a dashboard sheet (Order Join Merch) wait for the drawer's
// exit like the link rows, then push `?sheet=` with the native history driver
// (never router.push — the depth counter rides in history.state). The
// dashboard's useOwnerSheet() sees the new URL and opens the sheet. There is
// no off-dashboard fallback: the drawer only exists on the dashboard, and a
// navigation to a sheet URL is exactly what CLAUDE.md forbids
// (join-merch-store-plan.md Phase 4.1, F5).
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

const subscribeNothing = () => () => {};
const noHint = () => false;

/** A plain left click (not a new-tab / new-window click), which we route ourselves. */
const isPlainClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

const DASHBOARD_PATH = "/owner/dashboard";

/**
 * Open a dashboard sheet from the menu: a push in place. The drawer only exists
 * on the dashboard, so anywhere else this is a bug in the caller, not a reason to navigate.
 */
const openDashboardSheet = (sheet: OwnerSheetId): void => {
  if (window.location.pathname !== DASHBOARD_PATH) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[OwnerAppBar] "${sheet}" sheet row used off ${DASHBOARD_PATH}; ignored.`);
    }
    return;
  }
  pushSheet(window.history, window.location, sheet);
};

const STORE_BUTTON_CLASS =
  "flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-ht-cyan-300 px-3 text-base font-black text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ht-cyan-300";

type HeaderStoreButtonProps = { expanded: boolean };

/**
 * The dashboard's header way into the Join Merch store (the menu row stays too).
 * Pushes `?sheet=store` in place — never router.push. Focus goes to the button
 * first (Safari doesn't focus a tapped button), so the sheet's opener capture in
 * useModalOverlay hands focus back here when the store closes.
 */
const HeaderStoreButtonView = ({ expanded }: HeaderStoreButtonProps) => (
  <button
    type="button"
    data-header-store-button
    aria-haspopup="dialog"
    aria-expanded={expanded}
    aria-label="Order Join Merch"
    onClick={(event) => {
      event.currentTarget.focus({ preventScroll: true });
      openDashboardSheet("store");
    }}
    className={STORE_BUTTON_CLASS}
  >
    <ShoppingBag aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={2.5} />
    <span aria-hidden="true" className="font-[1000]">
      Shop
    </span>
  </button>
);

// useSearchParams needs a Suspense boundary (Next 16); the fallback is the same button, closed.
const HeaderStoreButtonLive = () => {
  const open = parseSheetParam(useSearchParams().get(SHEET_PARAM)) === "store";
  return <HeaderStoreButtonView expanded={open} />;
};

const HeaderStoreButton = () => (
  <Suspense fallback={<HeaderStoreButtonView expanded={false} />}>
    <HeaderStoreButtonLive />
  </Suspense>
);

const MENU_ROW_CLASS =
  "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ht-cyan-300";

export const OwnerAppBar = ({ leading, children, className = "" }: OwnerAppBarProps) => {
  const router = useRouter();
  const logoRef = useRef<HTMLButtonElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  // A menu link tapped: the drawer slides away first (releasing its scroll lock on
  // THIS page), then we navigate — otherwise the lock's cleanup restores the
  // dashboard's scroll offset onto the new page.
  const pendingHref = useRef<string | null>(null);
  // Same for a row that opens a dashboard sheet: push `?sheet=` only after the drawer is gone.
  const pendingSheet = useRef<OwnerSheetId | null>(null);
  // First visit only: pulse the arrow button a few times so it reads as a button.
  // Only where the arrow is shown — a sub-page with `leading` must not spend the hint.
  const hintPulse = useSyncExternalStore(subscribeNothing, leading ? noHint : menuHintForThisVisit, noHint);

  return (
    <header
      className={`sticky top-0 z-40 border-b border-ht-hairline bg-ht-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur ${className}`}
    >
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-4">
        {leading ?? (
          <button
            ref={logoRef}
            type="button"
            onClick={() => {
              pendingHref.current = null; // reopened mid-exit: that link was abandoned
              pendingSheet.current = null;
              setMenuOpen(true);
            }}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            className="relative -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ht-cyan-300 text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ht-cyan-300"
          >
            {hintPulse ? (
              <span
                aria-hidden="true"
                data-menu-hint-pulse
                className="absolute inset-0 rounded-full bg-ht-cyan-300 motion-safe:animate-[ping_1.2s_cubic-bezier(0,0,0.2,1)_3] motion-reduce:hidden"
              />
            ) : null}
            <ChevronRight aria-hidden="true" className="relative h-6 w-6" strokeWidth={3} />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center">{children}</div>
        {/* Trailing slot: the store button on the dashboard; a spacer on sub-pages keeps the title centred. */}
        {leading ? <span aria-hidden="true" className="h-10 w-10 shrink-0" /> : <HeaderStoreButton />}
      </div>

      {leading ? null : (
        <>
          <OwnerMenuDrawer
            open={menuOpen}
            onRequestClose={() => setMenuOpen(false)}
            label="Menu"
            returnFocusRef={logoRef}
            onExited={() => {
              const href = pendingHref.current;
              const sheet = pendingSheet.current;
              pendingHref.current = null;
              pendingSheet.current = null;
              if (href) router.push(href);
              else if (sheet) openDashboardSheet(sheet);
            }}
          >
            <div className="mb-2 flex items-center gap-3 px-3">
              {/* The same button, carried into the drawer and flipped to point left: tap it again to close. */}
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ht-cyan-300 text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ht-cyan-300"
              >
                <ChevronLeft aria-hidden="true" className="h-6 w-6" strokeWidth={3} />
              </button>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">Menu</p>
            </div>
            <nav aria-label="Partner menu" className="flex flex-col gap-1 px-2">
              {visibleOwnerMenuItems().map((item) => {
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
                if (item.sheet) {
                  const sheet = item.sheet;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => {
                        pendingSheet.current = sheet;
                        setMenuOpen(false);
                      }}
                      className={MENU_ROW_CLASS}
                    >
                      {body}
                    </button>
                  );
                }
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
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={(event) => {
                      if (!isPlainClick(event)) return;
                      event.preventDefault();
                      pendingHref.current = item.href;
                      setMenuOpen(false);
                    }}
                    className={MENU_ROW_CLASS}
                  >
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
