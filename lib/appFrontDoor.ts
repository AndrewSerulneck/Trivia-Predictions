import { cookieDomain } from "@/lib/domainSplit";
import { isNativeApp, nativeLaunchUrl } from "@/lib/nativeApp";

// The native app's front door (docs/native-app-store-plan.md Phase 2E items 3–4).
//
// The app always opens on `play.` `/`, the player sign-in. A phone where a
// partner signed in inside the app remembers "partner", and the NEXT plain
// launch from the app icon skips straight to the Partner Dashboard. Everything
// else — no remembered side, a launch that came through a link or the join QR
// (Andrew's QR rule), an expired partner session — shows the front door.
//
// The remembered side is a CONVENIENCE, never an access check: it only picks
// which page to open, and that page's own auth decides what you may see. It is
// a cookie, not localStorage (the plan's first idea), because the partner signs
// in on the apex (`hightopchallenge.com/owner/login`) while the launch decision
// runs on `play.`, and localStorage is per host. The cookie carries the shared
// `.hightopchallenge.com` domain (NEXT_PUBLIC_COOKIE_DOMAIN), is set and read by
// JavaScript only, and is written only inside the app.

export const APP_SIDE_COOKIE = "htc_app_side";
const APP_SIDE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

/** Where a remembered partner lands on an icon launch (apex page; build the href with marketingHref). */
export const PARTNER_LAUNCH_PATH = "/owner/dashboard";

export type RememberedAppSide = "partner" | null;

/**
 * What we know about the partner's session when choosing. The launch page on
 * `play.` cannot see the apex's HttpOnly owner cookie, so it decides with
 * "unchecked"; the dashboard's own first-load call (GET /api/owner/dashboard)
 * then answers "valid" or "expired". No extra request anywhere.
 */
export type PartnerSessionState = "unchecked" | "valid" | "expired";

export type AppLaunchDestination = "front-door" | "partner-dashboard";

/**
 * The front-door choice, pure so it can be unit-tested
 * (tests/lib.app-front-door.test.ts).
 *
 * - Launched through a link or QR → front door (player sign-in), whatever the
 *   phone remembers: whoever scans the printed join QR is a player.
 * - Nothing remembered → front door.
 * - "partner" + an expired session → front door.
 * - "partner" + a valid or not-yet-checked session → the Partner Dashboard.
 */
export const chooseAppLaunchDestination = ({
  rememberedSide,
  partnerSession,
  launchedFromLink,
}: {
  rememberedSide: RememberedAppSide;
  partnerSession: PartnerSessionState;
  launchedFromLink: boolean;
}): AppLaunchDestination => {
  if (launchedFromLink) return "front-door";
  if (rememberedSide !== "partner") return "front-door";
  if (partnerSession === "expired") return "front-door";
  return "partner-dashboard";
};

/** Reads the remembered side out of a `document.cookie`-style string. Pure. */
export const parseRememberedAppSide = (cookieString: string | null | undefined): RememberedAppSide => {
  const match = (cookieString ?? "").match(new RegExp(`(?:^|;\\s*)${APP_SIDE_COOKIE}=([^;]*)`));
  return match?.[1] === "partner" ? "partner" : null;
};

export const readRememberedAppSide = (): RememberedAppSide => {
  if (typeof document === "undefined") return null;
  try {
    return parseRememberedAppSide(document.cookie);
  } catch {
    return null;
  }
};

const writeSideCookie = (value: string, maxAgeSeconds: number): void => {
  if (typeof document === "undefined") return;
  try {
    const domain = cookieDomain();
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${APP_SIDE_COOKIE}=${value}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax` +
      `${domain ? `; Domain=${domain}` : ""}${secure}`;
  } catch {
    // A blocked cookie only costs the shortcut; the front door still works.
  }
};

/** A partner is signed in inside the app: open on the dashboard next time. No-op on the website. */
export const rememberPartnerSide = (): void => {
  if (!isNativeApp()) return;
  if (readRememberedAppSide() === "partner") return;
  writeSideCookie("partner", APP_SIDE_MAX_AGE_SECONDS);
};

/** Forget the side (partner signed out, or the session was gone at launch). Safe anywhere. */
export const forgetAppSide = (): void => {
  if (readRememberedAppSide() === null) return;
  writeSideCookie("", 0);
};

/**
 * True only on the app's FIRST page of a cold launch: inside the app, with a
 * one-entry history (the shell loads `server.url`, and the front door's own
 * hop uses `location.replace`, which keeps it at one), and not a reload. Any
 * page reached by tapping around has a longer history, so a partner who taps
 * back to the front door is never bounced to the dashboard again.
 */
export const isAppLaunchEntry = (): boolean => {
  if (!isNativeApp()) return false;
  try {
    if (window.history.length !== 1) return false;
    const [entry] = window.performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    return entry?.type !== "reload" && entry?.type !== "back_forward";
  } catch {
    return false;
  }
};

/**
 * Did this launch come through a link? True when the shell reports a launch URL
 * (Universal Links / App Links, Phase 3) or the page itself was opened with a
 * venue link (`?v=`). Before Phase 3 a QR scan opens the browser, not the app,
 * so this is false for every icon launch.
 */
export const launchedFromLink = async (): Promise<boolean> => {
  try {
    if (new URLSearchParams(window.location.search).has("v")) return true;
  } catch {
    // fall through to the shell's answer
  }
  return (await nativeLaunchUrl()) !== null;
};
