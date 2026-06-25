/**
 * Username moderation — Phase 1: static blocklist + leet-speak normalization.
 * Phase 2: Claude Haiku AI classification for anything the static check misses.
 */

export type ModerationResult =
  | { allowed: true }
  | { allowed: false; reason: string };

// ---------------------------------------------------------------------------
// Leet-speak / homoglyph normalization
// Collapses common substitutions so "h4t3r" matches "hater", etc.
// ---------------------------------------------------------------------------
const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
  "!": "i",
  "+": "t",
  "|": "i",
};

function normalizeLeet(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((c) => LEET_MAP[c] ?? c)
    .join("")
    .replace(/[^a-z]/g, "");
}

// Split a username into camelCase tokens, then leet-normalize each.
// "ShitakeChef" → ["shitake", "chef"]; "TrumpEter" → ["trump", "eter"].
// Used to avoid false positives from innocent compound words.
function tokenizeUsername(username: string): string[] {
  return username
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(normalizeLeet);
}

// ---------------------------------------------------------------------------
// Blocklist — exact matches against the leet-normalized username.
// Keep in alphabetical order within each section for ease of review.
// ---------------------------------------------------------------------------

/** Words that are always blocked, regardless of position. */
const BLOCKED_EXACT: ReadonlySet<string> = new Set([
  // Slurs / hate speech (abbreviated — add full forms as needed)
  "beaner",
  "chink",
  "cracker",
  "cunt",
  "dyke",
  "fag",
  "faggot",
  "gook",
  "kike",
  "negro",
  "nigga",
  "nigger",
  "raghead",
  "retard",
  "slut",
  "spic",
  "tranny",
  "wetback",
  "whore",
  // Sexual / explicit
  "anal",
  "anus",
  "ass",
  "asshole",
  "bitch",
  "blowjob",
  "boob",
  "boobs",
  "cock",
  "cocks",
  "cum",
  "cumshot",
  "dick",
  "dildo",
  "fuck",
  "fucker",
  "fucking",
  "homo",
  "horny",
  "milf",
  "penis",
  "porn",
  "porno",
  "pussy",
  "rape",
  "rapist",
  "scrotum",
  "sex",
  "sexy",
  "shit",
  "shithead",
  "tit",
  "tits",
  "vagina",
  "viagra",
  "wank",
  "wanker",
  // Violence / threats
  "kill",
  "murder",
  "terrorist",
  "nazi",
  "hitler",
  // Political / divisive figures & parties (keep apolitical)
  "antifa",
  "biden",
  "communist",
  "democrat",
  "fascist",
  "maga",
  "marxist",
  "republican",
  "socialist",
  "trump",
]);

// Slurs that must be caught even embedded inside a longer word (e.g. "mynigga").
// These do not appear in innocent English compound words.
const BLOCKED_SUBSTRINGS: readonly string[] = [
  "nigga",
  "nigger",
  "faggot",
  "kkk",
];

// Terms blocked only when they form a complete camelCase token (checked via
// tokenizeUsername). This avoids false positives like "Trumpeter", "ShitakeChef",
// "Hancock", or "Drapery" while still catching "Trump", "FuckFace", "ShitHead".
const BLOCKED_TOKEN_EXACT: ReadonlySet<string> = new Set([
  "hitler",
  "nazi",
  "maga",
  "trump",
  "biden",
  "fuck",
  "shit",
  "cunt",
  "cock",
  "pussy",
  "rape",
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check a candidate username against the static blocklist.
 * Input should be the *display* username (pre-normalized by normalizeUsername).
 */
export function checkUsernameStatic(username: string): ModerationResult {
  const clean = normalizeLeet(username);

  if (BLOCKED_EXACT.has(clean)) {
    return { allowed: false, reason: "Username contains prohibited content." };
  }

  for (const sub of BLOCKED_SUBSTRINGS) {
    if (clean.includes(sub)) {
      return { allowed: false, reason: "Username contains prohibited content." };
    }
  }

  for (const token of tokenizeUsername(username)) {
    if (BLOCKED_TOKEN_EXACT.has(token)) {
      return { allowed: false, reason: "Username contains prohibited content." };
    }
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Phase 2 — Claude Haiku AI classification
// Runs only when the static check passes. Fail-open: if the API call throws
// or returns an unexpected shape, we allow the username through.
// ---------------------------------------------------------------------------

const MODERATION_SYSTEM_PROMPT = `You are a username moderation assistant for a live trivia bar game app used by adults at social events in the US.

Your job: decide whether a proposed username is acceptable.

BLOCK usernames that are:
- Racial, ethnic, or religious slurs
- Sexual or explicit content
- Violent or threatening language
- Hate speech or targeted harassment
- Politically divisive, partisan, or polarizing (party names, political figures, slogans)
- Rude, mean-spirited, or designed to demean others

ALLOW usernames that are:
- Playful or silly (e.g. "TriviaNerd", "QuizWizard", "BeerMe")
- Pop culture references that are not offensive
- Puns, wordplay, or creative handles
- Names that are edgy but not hateful

Respond with ONLY valid JSON in this exact shape:
{"allowed": true}
or
{"allowed": false, "reason": "brief human-readable reason"}

Do not include any other text.`;

type HaikuResponse = { allowed: true } | { allowed: false; reason: string };

export async function checkUsernameAI(username: string): Promise<ModerationResult> {
  const apiKey = process.env.ANTHROPIC_USERNAME_MODERATOR_API_KEY;
  if (!apiKey) {
    console.warn("[usernameModerator] ANTHROPIC_USERNAME_MODERATOR_API_KEY not set — skipping AI check");
    return { allowed: true };
  }

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 64,
      system: MODERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Username: "${username}"` }],
    });

    const text = message.content.find((b) => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text) as HaikuResponse;

    if (parsed.allowed === true) return { allowed: true };
    if (parsed.allowed === false) {
      return { allowed: false, reason: "Username contains prohibited content." };
    }
    return { allowed: true };
  } catch (err) {
    console.warn("[usernameModerator] AI check failed — failing open", err instanceof Error ? err.message : err);
    return { allowed: true };
  }
}

/**
 * Full moderation pipeline: static blocklist first, then AI if static passes.
 * Always fail-open on AI errors.
 */
export async function checkUsername(username: string): Promise<ModerationResult> {
  const staticResult = checkUsernameStatic(username);
  if (!staticResult.allowed) return staticResult;
  return checkUsernameAI(username);
}
