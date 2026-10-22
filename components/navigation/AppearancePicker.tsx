"use client";

import { useId, useSyncExternalStore } from "react";
import { syncNativeStatusBar } from "@/lib/nativeStatusBar";
import {
  APPEARANCE_COPY,
  applyThemeForPath,
  DEFAULT_THEME_PREFERENCE,
  readThemePreference,
  subscribeThemePreference,
  writeThemePreference,
  type ThemePreference,
} from "@/lib/theme";

// The Appearance row of the player menu (docs/light-theme-plan.md Phase 7): Dark / Light / Match my
// phone. The choice is saved on the phone (lib/theme.ts) and applied at once, so a player on Venue
// Home sees the page change under the open drawer. AccountMenuList renders it only while the
// light-theme flag is on. Words live in APPEARANCE_COPY; the look is the venue hub's tab switch.
export function AppearancePicker() {
  const titleId = useId();
  // The server (the drawer is server-rendered) can't see the phone's storage, so it renders the
  // default and the stored choice takes over on hydration.
  const preference = useSyncExternalStore(
    subscribeThemePreference,
    readThemePreference,
    () => DEFAULT_THEME_PREFERENCE,
  );

  const choose = (next: ThemePreference) => {
    writeThemePreference(next);
    syncNativeStatusBar(applyThemeForPath(window.location.pathname));
  };

  return (
    <div>
      <div id={titleId} className="text-footnote font-black uppercase tracking-[0.08em] text-ht-fg-muted">
        {APPEARANCE_COPY.title}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={titleId}
        className="mt-2 grid grid-cols-[auto_auto_1fr] gap-1 rounded-full border border-ht-tab-track-edge bg-ht-tab-track p-1 shadow-ht-tab-track"
      >
        {APPEARANCE_COPY.options.map((option) => {
          const selected = preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(option.value)}
              className={`tp-clean-button tp-player-hit-target tp-player-pressable whitespace-nowrap rounded-full px-4 py-2 text-footnote font-black ${
                selected ? "bg-ht-accent text-ht-on-fill" : "bg-ht-tab-idle text-ht-fg-secondary"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-sm leading-snug text-ht-fg-muted">{APPEARANCE_COPY.note}</p>
    </div>
  );
}
