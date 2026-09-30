// `?sheet=&step=` for the Partner Dashboard's slide-up flows
// (docs/partner-dashboard-app-redesign-plan.md §4d).
//
// WHY THE URL. The phone's Back gesture must close the sheet or go back one
// step, never leave the dashboard. Putting the open sheet and step in the URL
// gives every step its own history entry, so the browser's own Back does the
// right thing, and `/owner/dashboard?sheet=schedule` deep-links straight in
// (the old /owner/schedule and /owner/competitions pages redirect there).
//
// WHY A DEPTH COUNTER. "Close" has to pop every entry the sheet pushed — not
// just one — or Back after closing would reopen the sheet on its last step.
// Each entry the sheet pushes carries `ownerSheetDepth` (1 = the entry that
// opened it) in `history.state`, which survives reloads. Next.js's patched
// pushState/replaceState copies its own internals into our state object and
// keeps our key (node_modules/next/dist/client/components/app-router.js,
// copyNextJsInternalHistoryState), and useSearchParams follows along.
//
// Pure: no React, no DOM globals. The history driver functions take a
// History-like object so tests can run them against a fake.

export const OWNER_SHEET_IDS = ["schedule", "rewards"] as const;

export type OwnerSheetId = (typeof OWNER_SHEET_IDS)[number];

export const SHEET_PARAM = "sheet";
export const STEP_PARAM = "step";
export const SHEET_DEPTH_KEY = "ownerSheetDepth";

/** Step ids are short slugs. Anything else in the URL is ignored, never rendered. */
const STEP_ID_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

export const parseSheetParam = (raw: string | null | undefined): OwnerSheetId | null => {
  if (!raw) return null;
  return (OWNER_SHEET_IDS as readonly string[]).includes(raw) ? (raw as OwnerSheetId) : null;
};

export const parseStepParam = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  return STEP_ID_PATTERN.test(raw) ? raw : null;
};

/**
 * The step to show. `activeSteps` is the flow's step list AFTER skip rules
 * (e.g. Schedule drops "game" when only one game can be scheduled). A missing,
 * malformed, unknown or skipped step falls back to the first active step, so a
 * stale or hand-edited URL always lands somewhere valid. `extraSteps` are
 * addressable screens outside the linear flow (e.g. "history", "detail").
 */
export const resolveStep = <StepId extends string>(
  raw: string | null | undefined,
  activeSteps: readonly StepId[],
  extraSteps: readonly StepId[] = []
): StepId | null => {
  const parsed = parseStepParam(raw);
  if (parsed !== null) {
    if ((activeSteps as readonly string[]).includes(parsed)) return parsed as StepId;
    if ((extraSteps as readonly string[]).includes(parsed)) return parsed as StepId;
  }
  return activeSteps[0] ?? null;
};

export const nextStep = <StepId extends string>(steps: readonly StepId[], current: StepId): StepId | null => {
  const index = steps.indexOf(current);
  if (index === -1) return steps[0] ?? null;
  return steps[index + 1] ?? null;
};

export const previousStep = <StepId extends string>(steps: readonly StepId[], current: StepId): StepId | null => {
  const index = steps.indexOf(current);
  if (index <= 0) return null;
  return steps[index - 1] ?? null;
};

/**
 * 1 = forward (new step enters from the right), -1 = backward, 0 = same step.
 * A step outside `steps` counts as further along than anything in it, so
 * opening "history" from the list slides forward and leaving it slides back.
 */
export const stepDirection = <StepId extends string>(
  steps: readonly StepId[],
  from: StepId,
  to: StepId
): 1 | -1 | 0 => {
  if (from === to) return 0;
  const rank = (step: StepId) => {
    const index = steps.indexOf(step);
    return index === -1 ? steps.length : index;
  };
  return rank(to) >= rank(from) ? 1 : -1;
};

export type SheetTarget = { sheet: OwnerSheetId; step?: string | null } | null;

/**
 * The query string for `target`, keeping every unrelated param. `null` removes
 * both sheet params (closed). Returns "" or a string starting with "?".
 */
export const buildSheetSearch = (currentSearch: string, target: SheetTarget): string => {
  const params = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch);
  params.delete(SHEET_PARAM);
  params.delete(STEP_PARAM);
  if (target) {
    params.set(SHEET_PARAM, target.sheet);
    const step = parseStepParam(target.step ?? null);
    if (step) params.set(STEP_PARAM, step);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
};

export const sheetHref = (pathname: string, currentSearch: string, target: SheetTarget, hash = ""): string =>
  `${pathname}${buildSheetSearch(currentSearch, target)}${hash}`;

/** The href for `step` of `sheet` on this page. */
export const nextStepHref = (pathname: string, currentSearch: string, sheet: OwnerSheetId, step: string): string =>
  sheetHref(pathname, currentSearch, { sheet, step });

// ─── History driver ─────────────────────────────────────────────────────────

/** How many history entries the open sheet has pushed (0 = none, e.g. deep link). */
export const readSheetDepth = (state: unknown): number => {
  if (!state || typeof state !== "object") return 0;
  const value = (state as Record<string, unknown>)[SHEET_DEPTH_KEY];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
};

/** The slice of `window.history` + `window.location` the driver needs. */
export type SheetHistory = {
  readonly state: unknown;
  pushState: (data: unknown, unused: string, url: string) => void;
  replaceState: (data: unknown, unused: string, url: string) => void;
  go: (delta: number) => void;
};

export type SheetLocation = { pathname: string; search: string; hash: string };

const depthState = (depth: number) => ({ [SHEET_DEPTH_KEY]: depth });

/** Open `sheet` (optionally at `step`) as a new history entry. */
export const pushSheet = (
  history: SheetHistory,
  location: SheetLocation,
  sheet: OwnerSheetId,
  step?: string | null
): void => {
  const depth = readSheetDepth(history.state);
  history.pushState(depthState(depth + 1), "", sheetHref(location.pathname, location.search, { sheet, step }, location.hash));
};

/** Move to `step` inside the open sheet: a new entry, so Back returns here. */
export const pushStep = (history: SheetHistory, location: SheetLocation, sheet: OwnerSheetId, step: string): void =>
  pushSheet(history, location, sheet, step);

/**
 * Swap the current entry's step without adding history — for corrections the
 * user didn't ask for (a skipped step, an invalid step normalised). Keeps depth.
 */
export const replaceStep = (
  history: SheetHistory,
  location: SheetLocation,
  sheet: OwnerSheetId,
  step: string | null
): void => {
  const depth = readSheetDepth(history.state);
  history.replaceState(depthState(depth), "", sheetHref(location.pathname, location.search, { sheet, step }, location.hash));
};

/**
 * The in-sheet StepBack button. If the previous history entry is the previous
 * step (depth ≥ 2 — this sheet pushed both), pop it, so the in-app button and
 * the phone's Back gesture stay the same thing. Otherwise (first entry of the
 * sheet, or a deep link) rewrite this entry in place.
 */
export const stepBack = (
  history: SheetHistory,
  location: SheetLocation,
  sheet: OwnerSheetId,
  previous: string
): void => {
  if (readSheetDepth(history.state) >= 2) {
    history.go(-1);
    return;
  }
  replaceStep(history, location, sheet, previous);
};

/** Close: pop every entry the sheet pushed; rewrite in place if it pushed none. */
export const closeSheet = (history: SheetHistory, location: SheetLocation): void => {
  const depth = readSheetDepth(history.state);
  if (depth > 0) {
    history.go(-depth);
    return;
  }
  history.replaceState(depthState(0), "", sheetHref(location.pathname, location.search, null, location.hash));
};

/**
 * A page that LOADS with `?sheet=` already in the URL (deep link, a redirect
 * from /owner/schedule, a shared link) has depth 0, so Back would leave the
 * dashboard entirely. Rewrite that entry to the plain dashboard and push the
 * sheet on top, so the history is exactly what tapping the section would have
 * made. No-op when the sheet is closed or this entry was pushed by a sheet
 * (a reload mid-flow keeps its depth).
 */
export const normalizeLandedSheet = (history: SheetHistory, location: SheetLocation): boolean => {
  const params = new URLSearchParams(location.search);
  const sheet = parseSheetParam(params.get(SHEET_PARAM));
  if (!sheet || readSheetDepth(history.state) > 0) return false;
  const step = parseStepParam(params.get(STEP_PARAM));
  history.replaceState(depthState(0), "", sheetHref(location.pathname, location.search, null, location.hash));
  history.pushState(depthState(1), "", sheetHref(location.pathname, location.search, { sheet, step }, location.hash));
  return true;
};
