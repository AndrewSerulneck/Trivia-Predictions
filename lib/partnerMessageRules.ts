// Partner-written messages (docs/native-app-store-plan.md Phase 5.5) — the rules the compose box and
// the server share. Pure and dependency-free: no `server-only`, no React.
//
// A partner types a short message on the Partner Dashboard (website only) and it goes as a push to the
// players of that bar who have "News from your bars" on. The send itself and the report/pause rules live
// in lib/push/venueMessages.ts and its database functions (migration 20261023145024).
//
// The filter is deliberately small (Andrew: words filter, report, admin kill switch): no web links or
// email addresses (a push is no place for a link nobody can check), and no slurs, sexual words or strong
// swearing. Players can report what gets past it, and enough reports pause the bar's messages.

/** Partner messages per bar per local day (Andrew, 2026-10-23). Separate from 5.4's VENUE_NEWS_DAILY_CAP. */
export const PARTNER_MESSAGES_DAILY_CAP = 2;

/** Distinct players reporting one message that pause the bar's messages until an admin un-pauses them. */
export const PARTNER_MESSAGE_REPORTS_TO_PAUSE = 3;

/** Longest message, in characters as Postgres counts them (code points, so an emoji is one). */
export const PARTNER_MESSAGE_MAX_LENGTH = 150;

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/**
 * Master flag, `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED` — the global kill switch. Off (the default) = no
 * "Message your players" menu row and `/api/owner/messages` 404s; players can still open and report a
 * message already sent. A NEXT_PUBLIC_* value, so changing it needs a redeploy; to stop one bar at once,
 * an admin pauses it (Venues → Partner messages). This is the single reader.
 */
export const isPartnerMessagesEnabled = (): boolean => truthy(process.env.NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED);

/** The URL query a tapped message push opens Venue Home with (`/venue/{id}?message={id}`). */
export const PARTNER_MESSAGE_PARAM = "message";

const MESSAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The message id in a page's query string, or null. While it is there, popup ads wait. */
export const partnerMessageIdFromSearch = (search: string): string | null => {
  const value = new URLSearchParams(search).get(PARTNER_MESSAGE_PARAM)?.trim() ?? "";
  return MESSAGE_ID_PATTERN.test(value) ? value : null;
};

/** One line, no control characters, single spaces, trimmed. */
export const normalizePartnerMessage = (raw: string): string =>
  raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Characters as Postgres's char_length counts them. */
export const partnerMessageLength = (text: string): number => [...text].length;

// Whole words (after undoing number/symbol look-alikes) that are never sent.
const BLOCKED_WORDS: ReadonlySet<string> = new Set([
  // Slurs
  "beaner",
  "chink",
  "dyke",
  "fag",
  "fags",
  "faggot",
  "faggots",
  "gook",
  "kike",
  "nigga",
  "niggas",
  "nigger",
  "niggers",
  "raghead",
  "retard",
  "retarded",
  "spic",
  "tranny",
  "wetback",
  // Sexual
  "blowjob",
  "cock",
  "cocks",
  "cum",
  "dildo",
  "porn",
  "porno",
  "pussy",
  "slut",
  "sluts",
  "whore",
  "whores",
  // Strong swearing
  "asshole",
  "assholes",
  "bitch",
  "bitches",
  "bullshit",
  "cunt",
  "cunts",
  "dick",
  "dicks",
  "fuck",
  "fucked",
  "fucker",
  "fuckers",
  "fucking",
  "fuckin",
  "motherfucker",
  "shit",
  "shits",
  "shitty",
  "twat",
]);

// Caught even run together with other letters ("fuckyeah"); none occur inside an innocent word.
const BLOCKED_INSIDE: readonly string[] = ["fuck", "nigga", "nigger", "faggot", "motherf"];

const LOOK_ALIKES: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

const undoLookAlikes = (text: string): string =>
  text
    .toLowerCase()
    .split("")
    .map((c) => LOOK_ALIKES[c] ?? c)
    .join("");

const LINK_PATTERNS: readonly RegExp[] = [
  /https?:\/\//i,
  /\bwww\./i,
  /[^\s@]+@[^\s@]+\.[a-z]{2,}/i,
  /\b[a-z0-9-]+\.(?:com|net|org|io|co|ly|me|app|gg|link|xyz|info|biz|us|tv|bar|club|site|online|shop|store|ai)\b/i,
];

export type PartnerMessageProblem = "empty" | "too_long" | "link" | "words";

export type PartnerMessageCheck = { ok: true; text: string } | { ok: false; problem: PartnerMessageProblem };

/** Is this message sendable? Returns the normalised text to send. */
export const checkPartnerMessage = (raw: string): PartnerMessageCheck => {
  const text = normalizePartnerMessage(raw);
  if (!text) return { ok: false, problem: "empty" };
  if (partnerMessageLength(text) > PARTNER_MESSAGE_MAX_LENGTH) return { ok: false, problem: "too_long" };
  if (LINK_PATTERNS.some((pattern) => pattern.test(text))) return { ok: false, problem: "link" };
  const plain = undoLookAlikes(text);
  const words = plain.split(/[^a-z]+/).filter(Boolean);
  if (words.some((word) => BLOCKED_WORDS.has(word))) return { ok: false, problem: "words" };
  // Inside each word on its own ("fuckyeah"), and inside a run of single-letter words ("f u c k",
  // "f.u.c.k"). Never joined across real words: "mother for" is not "motherf".
  const containsBlocked = (chunk: string): boolean => BLOCKED_INSIDE.some((part) => chunk.includes(part));
  if (words.some(containsBlocked)) return { ok: false, problem: "words" };
  let spelledOut = "";
  for (const word of [...words, ""]) {
    if (word.length === 1) {
      spelledOut += word;
      continue;
    }
    if (containsBlocked(spelledOut)) return { ok: false, problem: "words" };
    spelledOut = "";
  }
  return { ok: true, text };
};

/** Words on screen for the compose box (partners) and the message sheet (players). Edit copy here. */
export const PARTNER_MESSAGE_COPY = {
  menuLabel: "Message Your Players",
  menuHint: "A short note to their phones",
  sheetTitle: "Message your players",
  intro: "Goes to the players of {bar} who have the Hightop Challenge app with “News from your bars” on.",
  placeholder: "Half-price wings during trivia tonight!",
  send: "Send",
  confirmTitle: "Send this to your players?",
  confirmBody: "It can't be taken back once it's sent.",
  confirmSend: "Yes, send it",
  confirmCancel: "Keep editing",
  remaining: (left: number): string =>
    left <= 0
      ? `No messages left today. You can send ${PARTNER_MESSAGES_DAILY_CAP} a day.`
      : `${left} message${left === 1 ? "" : "s"} left today.`,
  noVenue: "Choose a venue to message its players.",
  noAudience: "None of your players has the app with News from your bars on yet, so there's no one to send it to.",
  sent: (devices: number): string => `Sent to ${devices} phone${devices === 1 ? "" : "s"}.`,
  paused: "Messages from this venue are paused. Contact Hightop support if you think that's a mistake.",
  recentTitle: "Sent",
  problems: {
    empty: "Type a message first.",
    too_long: "Keep it to 150 characters.",
    link: "Messages can't include links or email addresses.",
    words: "That message has words we can't send. Please reword it.",
  } satisfies Record<PartnerMessageProblem, string>,
  // Player side: the sheet a tapped message opens on Venue Home.
  playerTitle: "Message from {bar}",
  playerFootnote: "Don't want these? Turn off News from your bars in the menu.",
  report: "Report this message",
  reportConfirm: "Report it?",
  reportDone: "Thanks. We'll take a look.",
  reportFailed: "Couldn't send that. Try again.",
  close: "Close",
} as const;
