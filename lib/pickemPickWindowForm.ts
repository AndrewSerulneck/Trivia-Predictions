// The pick-window form in Game Settings, owner + admin (docs/cancelled-prizes-pick-windows-away-mode-plan.md
// Phase B4). Pure and client-safe. Every rule about what a window means stays in lib/pickemPickWindow.ts;
// this file only holds the form's sports, its draft and the change body it sends to the existing save
// (`pickWindows`, B1). The server re-checks everything (readPickEmPickWindowChanges).

import {
  PICK_WINDOW_DAY_LABELS,
  formatPickWindowTime,
  pickWindowLengthMinutes,
  type PickEmPickWindow,
  type PickEmPickWindowChanges,
  type PickEmPickWindows,
} from "@/lib/pickemPickWindow";
import type { PickEmSportSlug } from "@/lib/pickemSports";

/** The sports the form lists, football first. `nfl` is NFL Pick 'Em. */
export const PICK_WINDOW_FORM_SPORTS: ReadonlyArray<{ slug: PickEmSportSlug; label: string }> = [
  { slug: "ncaaf", label: "College Football" },
  { slug: "nfl", label: "NFL Pick 'Em" },
  { slug: "nba", label: "Basketball" },
  { slug: "mlb", label: "MLB" },
  { slug: "nhl", label: "NHL" },
  { slug: "soccer", label: "Soccer" },
  { slug: "mma", label: "MMA" },
  { slug: "tennis", label: "Tennis" },
];

/** What "Set days" starts from: Mon 12:00 AM to Wed 11:59 PM (the plan's example). */
export const DEFAULT_PICK_WINDOW: PickEmPickWindow = {
  openDay: "mon",
  openTime: "00:00",
  closeDay: "wed",
  closeTime: "23:59",
};

/** Per sport: the partner's unsaved answer (null = "Always open"). A sport not here is unchanged. */
export type PickWindowDrafts = Partial<Record<PickEmSportSlug, PickEmPickWindow | null>>;

export const PICK_WINDOW_SAME_TIME_MESSAGE = "Opening and closing can't be the same time.";

const sameWindow = (a: PickEmPickWindow | null, b: PickEmPickWindow | null): boolean =>
  a === null || b === null
    ? a === b
    : a.openDay === b.openDay && a.openTime === b.openTime && a.closeDay === b.closeDay && a.closeTime === b.closeTime;

/** What the form shows for a sport: its draft if any, else the saved window, else "Always open". */
export const pickWindowShown = (
  saved: PickEmPickWindows,
  drafts: PickWindowDrafts,
  slug: PickEmSportSlug,
): PickEmPickWindow | null => (slug in drafts ? (drafts[slug] ?? null) : (saved[slug] ?? null));

/** The save body's `pickWindows`: only sports whose answer differs from what's saved; null = nothing to save. */
export const pickWindowChangesFromDrafts = (
  saved: PickEmPickWindows,
  drafts: PickWindowDrafts,
): PickEmPickWindowChanges | null => {
  const changes: PickEmPickWindowChanges = {};
  for (const { slug } of PICK_WINDOW_FORM_SPORTS) {
    if (!(slug in drafts)) continue;
    const draft = drafts[slug] ?? null;
    if (!sameWindow(draft, saved[slug] ?? null)) changes[slug] = draft;
  }
  return Object.keys(changes).length > 0 ? changes : null;
};

/** The first thing wrong with the drafts (a window that opens and closes at the same moment), or null. */
export const pickWindowDraftsError = (drafts: PickWindowDrafts): string | null => {
  for (const window of Object.values(drafts)) {
    if (window && pickWindowLengthMinutes(window) === 0) return PICK_WINDOW_SAME_TIME_MESSAGE;
  }
  return null;
};

/** "Mon 12:00 AM – Wed 11:59 PM". */
export const describePickWindow = (window: PickEmPickWindow): string =>
  `${PICK_WINDOW_DAY_LABELS[window.openDay]} ${formatPickWindowTime(window.openTime)} – ${
    PICK_WINDOW_DAY_LABELS[window.closeDay]
  } ${formatPickWindowTime(window.closeTime)}`;
