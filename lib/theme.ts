// Light theme — the one home for the theme decision (docs/light-theme-plan.md §3).
//
// Dark is the default everywhere. A player who chooses Light (or "Match my phone" on a phone set
// to light) gets `data-theme="light"` on <html> ONLY on the four light-capable screens — Venue
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

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

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

export const PREFERS_LIGHT_MEDIA_QUERY = "(prefers-color-scheme: light)";

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
    { value: "system", label: "Match my phone" },
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
  raw === "dark" || raw === "light" || raw === "system" ? raw : DEFAULT_THEME_PREFERENCE;

export const resolveTheme = (preference: ThemePreference, pathname: string, prefersLight: boolean): ResolvedTheme => {
  if (!isLightThemePath(pathname)) return "dark";
  if (preference === "light") return "light";
  if (preference === "system") return prefersLight ? "light" : "dark";
  return "dark";
};

/**
 * Inline <head> script: the same decision as `resolveTheme`, before React or any CSS paints.
 * It only ever ADDS the light attribute — dark is the attribute's absence, so a script error can
 * only ever leave a page dark. Pinned against `resolveTheme` by tests/light-theme-contract.test.ts.
 */
export const themePrePaintScript = (): string =>
  `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(p!=="dark"&&p!=="light"&&p!=="system")p=${JSON.stringify(DEFAULT_THEME_PREFERENCE)};` +
  `if(p==="dark"||!new RegExp(${JSON.stringify(LIGHT_THEME_PATH_PATTERN)}).test(location.pathname))return;` +
  `if(p==="system"&&!(window.matchMedia&&window.matchMedia(${JSON.stringify(PREFERS_LIGHT_MEDIA_QUERY)}).matches))return;` +
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

/** For `useSyncExternalStore` (the Appearance row): told whenever `writeThemePreference` saves. */
export const subscribeThemePreference = (listener: () => void): (() => void) => {
  preferenceListeners.add(listener);
  return () => {
    preferenceListeners.delete(listener);
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

export const prefersLightColorScheme = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia?.(PREFERS_LIGHT_MEDIA_QUERY).matches === true;
  } catch {
    return false;
  }
};

/**
 * Sets or clears the light attribute for `pathname` and points `<meta name="theme-color">` at the
 * matching colour. A no-op (always dark) with the flag off. `color-scheme` follows the attribute
 * in CSS (app/globals.css), so it needs nothing here. The caller passes the result to
 * `syncNativeStatusBar` (lib/nativeStatusBar.ts) for the app's status bar.
 */
export const applyThemeForPath = (pathname: string): ResolvedTheme => {
  if (typeof document === "undefined") return "dark";
  const theme = isLightThemeEnabled() ? resolveTheme(readThemePreference(), pathname, prefersLightColorScheme()) : "dark";
  const root = document.documentElement;
  if (theme === "light") root.setAttribute(THEME_ATTRIBUTE, "light");
  else root.removeAttribute(THEME_ATTRIBUTE);
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    if (meta.content !== THEME_COLOR[theme]) meta.content = THEME_COLOR[theme];
  });
  return theme;
};

