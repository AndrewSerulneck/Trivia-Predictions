// Push notifications (docs/native-app-store-plan.md Phase 5.1) — the rules both the server and the
// app's screens share. Pure and dependency-free: no `server-only`, no React.
//
// A phone push is one of three kinds, each with its own on/off switch in the account menu:
//   games   — "Live Trivia starts soon" at the venue the player last used on that phone;
//   prizes  — a prize won, about to expire or taken back (any notification that links to the wallet);
//   results — everything else the app already tells players in its notification list (Bingo, Pick 'Em,
//             predictions, fantasy, challenges).
// Marketing pushes don't exist. If they are ever added they need their own switch, OFF until the player
// turns it on (Apple 4.5.4) — never fold them into one of these three.

export type PushCategory = "games" | "prizes" | "results";

export type PushPreferences = Record<PushCategory, boolean>;

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = { games: true, prizes: true, results: true };

export const PUSH_CATEGORIES: readonly PushCategory[] = ["games", "prizes", "results"];

/** The path every prize notification links to (lib/challengeCampaigns.ts, the expiry cron, Squares). */
const PRIZE_WALLET_PATH = "/redeem-prizes";

/** Which switch governs an in-app notification, decided by where it links. */
export const pushCategoryForNotification = (linkUrl: string | null | undefined): PushCategory => {
  const path = String(linkUrl ?? "").trim();
  if (path === PRIZE_WALLET_PATH || path.startsWith(`${PRIZE_WALLET_PATH}?`) || path.startsWith(`${PRIZE_WALLET_PATH}/`)) {
    return "prizes";
  }
  return "results";
};

/**
 * The page a tapped push opens, or null. Only a path on our own site: it must start with one "/",
 * never "//" (another host) or a backslash, and carry no control characters. A push payload is data
 * from our server, but the app never navigates to anything it can't prove is ours.
 */
export const safePushPath = (url: unknown): string | null => {
  if (typeof url !== "string") return null;
  const path = url.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  if (path.length > 512) return null;
  return path;
};

/**
 * Words on screen for the welcome ask, the Venue Home card and the account-menu settings. Edit copy here.
 * Promise ONLY pushes the server really sends (the three categories above): Apple rejects an ask that
 * promises more. "When this bar schedules games or adds prizes" waits for Phase 5.4, which sends them.
 */
export const PUSH_COPY = {
  welcomeTitle: "Want to know the moment you win?",
  welcomeBenefits: {
    prizes: "When you win a prize, and before it expires",
    results: "When your Bingo, Pick 'Em and prediction results are in",
    games: "When Live Trivia is about to start at your bar",
  } satisfies Record<PushCategory, string>,
  welcomeFootnote: "You can change this any time in the menu.",
  askTitle: "Want to know when you win?",
  askBody: "Turn on notifications for your prizes, your results and Live Trivia starting here.",
  askAccept: "Turn on",
  askDecline: "Not now",
  settingsTitle: "Notifications",
  settingsOff: "Off on this phone.",
  settingsTurnOn: "Turn on",
  settingsBlocked: "Notifications are turned off for Hightop Challenge in your phone's Settings.",
  settingsFailed: "Couldn't save that. Try again.",
  labels: {
    games: "Live games starting",
    prizes: "Prizes",
    results: "Results",
  } satisfies Record<PushCategory, string>,
} as const;
