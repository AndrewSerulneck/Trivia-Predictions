// Light theme — the one home for the theme decision (docs/light-theme-plan.md §3).
//
// Dark is the default everywhere. A player who chooses Light gets `data-theme="light"` on <html> ONLY on the four light-capable screens — Venue
// Home, Pick 'Em, NFL Pick 'Em, Fantasy — and app/globals.css `:root[data-theme="light"]` swaps
// the colour tokens. Every other screen stays dark because the attribute is simply absent there.
//
// The choice lives on the device (localStorage `htc_theme`): no account column, no cookie, no
// server read — the root layout must never read cookies()/headers(), which would turn every
// static page into a per-visit render (tests/light-theme-contract.test.ts). It is applied before
// the first paint by `themePrePaintScript()` (inline in app/layout.tsx <head>) and re-applied on
// in-app navigation by components/ui/ThemeRouteSync.tsx.
//
// Flag-gated, same reversible convention as lib/domainSplit.ts: NEXT_PUBLIC_LIGHT_THEME_ENABLED
// off (the default) = neither the script nor ThemeRouteSync is rendered, every page is dark.
// This file is the only reader of the flag and of `htc_theme`.
//
// Pure apart from the browser helpers at the bottom, which guard `window` and wrap every
// storage access in try/catch (private windows and blocked storage throw).

// Light or Dark only (Andrew, 2026-10-22: no "Match my phone"). A stored legacy "system" reads as
// the default.
export type ThemePreference = "dark" | "light";
export type ResolvedTheme = ThemePreference;

export const THEME_STORAGE_KEY = "htc_theme";
export const THEME_ATTRIBUTE = "data-theme";
/** What a player who never chose gets (plan §6 Q1 default). Changing it is a product decision. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "dark";

/**
 * The light-capable paths: the venue hub `/venue/<id>` (not its `/redeem` or `/screen` pages),
 * `/pickem` and everything under it, `/nfl-pickem`, `/fantasy` and everything under it. One
 * pattern, used by both `isLightThemePath` and the pre-paint script, so the two can't drift.
 */
export const LIGHT_THEME_PATH_PATTERN = "^/(?:venue/[^/]+|pickem(?:/.*)?|nfl-pickem|fantasy(?:/.*)?)/?$";
const LIGHT_THEME_PATH_RE = new RegExp(LIGHT_THEME_PATH_PATTERN);

/**
 * `<meta name="theme-color">` (the browser's and Android's bar colour above the page) per theme:
 * the dark page's navy, and white to match the light screens' app bar (`--ht-chrome-bar` /
 * `--ht-hub-bar`, white at 94%). app/layout.tsx renders the dark one; `applyThemeForPath` swaps it.
 * The app's native status bar uses the same two colours (lib/nativeStatusBar.ts).
 */
export const THEME_COLOR: Record<ResolvedTheme, string> = { dark: "#020617", light: "#ffffff" };

/** The Appearance row's words (components/navigation/AppearancePicker.tsx). Edit copy here. */
export const APPEARANCE_COPY = {
  title: "Appearance",
  note: "Light works on Venue Home, Pick 'Em, NFL Pick 'Em and Fantasy. Other games stay dark.",
  options: [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
  ],
} as const satisfies { title: string; note: string; options: ReadonlyArray<{ value: ThemePreference; label: string }> };

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/** Master flag (single reader). A NEXT_PUBLIC_* value: set it in Vercel, then redeploy. */
export const isLightThemeEnabled = (): boolean => truthy(process.env.NEXT_PUBLIC_LIGHT_THEME_ENABLED);

export const isLightThemePath = (pathname: string): boolean => LIGHT_THEME_PATH_RE.test(pathname);

export const parseThemePreference = (raw: unknown): ThemePreference =>
  raw === "dark" || raw === "light" ? raw : DEFAULT_THEME_PREFERENCE;

export const resolveTheme = (preference: ThemePreference, pathname: string): ResolvedTheme =>
  preference === "light" && isLightThemePath(pathname) ? "light" : "dark";

/**
 * Inline <head> script: the same decision as `resolveTheme`, before React or any CSS paints.
 * It only ever ADDS the light attribute — dark is the attribute's absence, so a script error can
 * only ever leave a page dark. Pinned against `resolveTheme` by tests/light-theme-contract.test.ts.
 */
export const themePrePaintScript = (): string =>
  `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(p!=="light"||!new RegExp(${JSON.stringify(LIGHT_THEME_PATH_PATTERN)}).test(location.pathname))return;` +
  `document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},"light")` +
  `}catch(_){}})()`;

// --- Browser helpers ---------------------------------------------------------------------------

export const readThemePreference = (): ThemePreference => {
  if (typeof window === "undefined") return DEFAULT_THEME_PREFERENCE;
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
};

const preferenceListeners = new Set<() => void>();

/**
 * Told whenever the choice changes: saved here by `writeThemePreference`, or in another tab of the
 * same site (the `storage` event, Phase 8.4). Used by the Appearance row (`useSyncExternalStore`)
 * and by ThemeRouteSync, which re-applies the theme.
 */
export const subscribeThemePreference = (listener: () => void): (() => void) => {
  preferenceListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    preferenceListeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
};

/** Saves the choice. The caller re-applies with `applyThemeForPath` (the Appearance row). */
export const writeThemePreference = (preference: ThemePreference): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // storage blocked: nothing is kept, so the page and the row both stay on the default
  }
  preferenceListeners.forEach((listener) => listener());
};

/**
 * Sets or clears the light attribute for `pathname` and points `<meta name="theme-color">` at the
 * matching colour. A no-op (always dark) with the flag off. `color-scheme` follows the attribute
 * in CSS (app/globals.css), so it needs nothing here. The caller passes the result to
 * `syncNativeStatusBar` (lib/nativeStatusBar.ts) for the app's status bar.
 */
export const applyThemeForPath = (pathname: string): ResolvedTheme => {
  if (typeof document === "undefined") return "dark";
  const theme = isLightThemeEnabled() ? resolveTheme(readThemePreference(), pathname) : "dark";
  const root = document.documentElement;
  if (theme === "light") root.setAttribute(THEME_ATTRIBUTE, "light");
  else root.removeAttribute(THEME_ATTRIBUTE);
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    if (meta.content !== THEME_COLOR[theme]) meta.content = THEME_COLOR[theme];
  });
  return theme;
};

