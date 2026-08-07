"use client";

import { useState } from "react";
import type { Venue } from "@/types";
import {
  MOBILE_SECTION_ORDER,
  MOBILE_SECTIONS,
  sectionLabel,
  type AdminSection,
} from "@/components/admin/adminSectionMeta";
import { MobileVenuesSection, BillingSection } from "@/components/admin/adminSectionComponents";
import { MobileBottomSheet } from "@/components/admin/mobile/MobileBottomSheet";
import { SectionErrorBoundary } from "@/components/admin/SectionErrorBoundary";

type MobileSection = (typeof MOBILE_SECTION_ORDER)[number];

const TAB_ICON: Record<MobileSection, string> = {
  "venue-manage": "🏠",
  "partner-billing": "💳",
};

type AdminMobileShellProps = {
  venues: Venue[];
  activeSection: AdminSection;
  onSelect: (section: AdminSection) => void;
  onSwitchToDesktop: () => void;
  onLogout: () => void;
  onVenueCreated: (venue: Venue) => void;
  onVenueUpdated: (venue: Venue) => void;
  onVenueDeleted: (venueId: string) => void;
};

export function AdminMobileShell({
  venues,
  activeSection,
  onSelect,
  onSwitchToDesktop,
  onLogout,
  onVenueCreated,
  onVenueUpdated,
  onVenueDeleted,
}: AdminMobileShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  // Defensive guard only — callers are expected to always pass one of the
  // allowlisted sections. Falls back to the first tab rather than
  // rendering nothing if that contract is ever violated.
  const safeSection: MobileSection = MOBILE_SECTIONS.has(activeSection)
    ? (activeSection as MobileSection)
    : MOBILE_SECTION_ORDER[0];

  function renderSection(section: MobileSection) {
    switch (section) {
      case "venue-manage":
        return (
          <MobileVenuesSection
            venues={venues}
            onVenueCreated={onVenueCreated}
            onVenueUpdated={onVenueUpdated}
            onVenueDeleted={onVenueDeleted}
            onNavigate={onSelect}
          />
        );
      case "partner-billing":
        return <BillingSection />;
    }
  }

  return (
    /* `h-full`, not `min-h-[100svh]`: AppShell already renders the admin surface
       inside `fixed inset-0 h-screen overflow-hidden` (AppShell.tsx) on top of
       `html/body { height: 100vh; overflow: hidden }` (globals.css,
       `.tp-admin-theme`), so this root's parent is a definite-height,
       non-scrolling box. With an indefinite `min-h-*` root, `main`'s `flex-1`
       grows to fit its content instead of scrolling it, which pushes the 3-tab
       `<nav>` below the clip boundary — and since the document cannot scroll,
       the shell's primary navigation becomes unreachable on exactly the two
       long sections (Venues, Partner Billing) that are two of its three tabs.
       `h-full` bounds the flex column so `main` overflows *itself* and its
       `overflow-y-auto` engages, keeping `header` and `nav` (both `flex-none`)
       pinned. See docs/admin-mobile-remediation-plan.md Phase R3. */
    <div className="flex h-full flex-col overflow-hidden bg-slate-100 [color-scheme:light]">
      {/* `min-h-14`, not `h-14`: the top inset is padding, and under
          `box-sizing: border-box` a definite `h-14` would let it eat the
          content box — on a notched iPhone (~47px inset) that squeezes the
          title and the 44x44 "More" button into a ~9px strip under the status
          bar. `.tp-admin-theme` zeroes padding on html/body/`.tp-app-shell`
          (globals.css), so nothing upstream supplies the inset; the header has
          to. A minimum height keeps the 3.5rem chrome bar on non-notched
          devices while letting the box GROW by the inset where there is one.
          Safe because the header is `flex-none` in a definite-height column —
          it is never the element asked to give way. */}
      <header className="flex min-h-14 flex-none items-center justify-between border-b border-slate-200 bg-white px-4 pt-[env(safe-area-inset-top)]">
        <h1 className="text-sm font-semibold text-slate-800">{sectionLabel(safeSection)}</h1>
        <button
          type="button"
          aria-label="More options"
          onClick={() => setMoreOpen(true)}
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <span className="text-xl leading-none">⋯</span>
        </button>
      </header>

      {/* `min-h-0` is load-bearing: a flex item defaults to `min-height: auto`,
          which refuses to shrink below its content, so without it `flex-1`
          would still grow past the bounded column and push the nav out. */}
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <SectionErrorBoundary>{renderSection(safeSection)}</SectionErrorBoundary>
      </main>

      <nav className="grid flex-none grid-cols-2 gap-1 border-t border-slate-200 bg-white px-1 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-1.5">
        {MOBILE_SECTION_ORDER.map((id) => {
          const isActive = id === safeSection;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-indigo-600 font-semibold text-white"
                  : "font-medium text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
              }`}
            >
              <span className="text-2xl leading-none">{TAB_ICON[id]}</span>
              {sectionLabel(id)}
            </button>
          );
        })}
      </nav>

      <MobileBottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <button
          type="button"
          onClick={() => {
            setMoreOpen(false);
            onSwitchToDesktop();
          }}
          className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Switch to Desktop
        </button>
        <button
          type="button"
          onClick={() => {
            setMoreOpen(false);
            onLogout();
          }}
          className="flex min-h-[44px] w-full items-center rounded-lg px-3 text-left text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Sign out
        </button>
      </MobileBottomSheet>
    </div>
  );
}
