// Push notifications (docs/native-app-store-plan.md Phase 5.1) — the rules both the server and the
// app's screens share. Pure and dependency-free: no `server-only`, no React.
//
// A phone push is one of four kinds, each with its own on/off switch in the account menu:
//   games   — "Live Trivia starts soon" at the venue the player last used on that phone;
//   prizes  — a prize won, about to expire or taken back (any notification that links to the wallet);
//   results — everything else the app already tells players in its notification list (Bingo, Pick 'Em,
//             predictions, fantasy, challenges);
//   news    — "News from your bars" (Phase 5.4): a bar the player belongs to saved a new game or prize
//             (lib/push/venueNews.ts). Promotional, so it is its own switch (Apple 4.5.4): the ask
//             states it before Turn on, and the menu turns it off. Partner-written messages (5.5) will
//             ride on this same switch — never fold either into the other three.

export type PushCategory = "games" | "prizes" | "results" | "news";

export type PushPreferences = Record<PushCategory, boolean>;

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = { games: true, prizes: true, results: true, news: true };

export const PUSH_CATEGORIES: readonly PushCategory[] = ["games", "prizes", "results", "news"];

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
 * Promise ONLY pushes the server really sends (the four categories above): Apple rejects an ask that
 * promises more. The "news" line is the explicit consent for the promotional pushes (Apple 4.5.4).
 */
export const PUSH_COPY = {
  welcomeTitle: "Want to know the moment you win?",
  welcomeBenefits: {
    prizes: "When you win a prize, and before it expires",
    results: "When your Bingo, Pick 'Em and prediction results are in",
    games: "When Live Trivia is about to start at your bar",
    news: "When your bars schedule new games and add prizes",
  } satisfies Record<PushCategory, string>,
  welcomeFootnote: "You can change this any time in the menu.",
  askTitle: "Want to know when you win?",
  askBody: "Turn on notifications for your prizes, your results, Live Trivia starting here, and new games and prizes at your bars.",
  askAccept: "Turn on",
  askDecline: "Not now",
  settingsTitle: "Notifications",
  settingsOff: "Off on this phone. Turn on for prizes, results, Live Trivia and news from your bars.",
  settingsTurnOn: "Turn on",
  settingsBlocked: "Notifications are turned off for Hightop Challenge in your phone's Settings.",
  settingsFailed: "Couldn't save that. Try again.",
  labels: {
    games: "Live games starting",
    prizes: "Prizes",
    results: "Results",
    news: "News from your bars",
  } satisfies Record<PushCategory, string>,
} as const;
