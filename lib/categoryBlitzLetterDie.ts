/**
 * Category Blitz letter die — pure timing rules (no React, no I/O).
 * Plan: docs/category-blitz-letter-die-plan.md (Phase 2). Numbers are the
 * prototype defaults Andrew accepted on 2026-10-30 (plan §2 item 6).
 *
 * The caller (Phase 4) owns the clock and three latched timestamps; this file
 * only answers "which stage is the die in right now?".
 */

/** The tumble starts this many seconds before the next round (letter still secret). */
export const DIE_TUMBLE_LEAD_S = 5;
/** One waiting bounce, floor to floor. Every bounce impact is a light buzz. */
export const DIE_HOP_MS = 520;
/** The landing hop; its impact is the strong buzz. */
export const DIE_LAND_MS = 760;
/** Two small settle bounces after the landing hop (no buzz). */
export const DIE_SETTLE_BOUNCES = 2;
export const DIE_SETTLE_MS = 340;
/** The letter holds centred before it flies. */
export const DIE_HOLD_MS = 700;
/** The fly into the corner badge (same as LAYOUT_MORPH_TRANSITION). */
export const DIE_FLY_MS = 450;
/**
 * If the letter has not arrived this long after the tumble began, give up:
 * the die is done and the game's normal round-start reveal takes over.
 */
export const DIE_MAX_TUMBLE_MS = 12_000;
/**
 * The letter was first seen more than this long after its round started →
 * no die, no replay, tumble or not (a page opened mid-round, or a letter the
 * poll delivered late). Measured at ARRIVAL, never "now": a die that lands on
 * time is still holding or flying 2–3 s into the round. Mirrors
 * ROUND_START_REVEAL_MAX_MS in components/category-blitz/RoundStartReveal.tsx
 * (3000); a test pins them equal.
 */
export const DIE_MID_ROUND_CUTOFF_MS = 3000;

/**
 * Letters the game can pick (`usableLetters` and `bUsableLetters` in
 * data/category-blitz/category-letter-index.json — a test pins them equal).
 * Copied so the phone never downloads the 230 KB index for the die's filler letters.
 */
export const DIE_USABLE_LETTERS: readonly string[] = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "L", "M", "N", "O", "P", "R", "S", "T", "W",
];

export type DieStage ="idle" | "tumbling" | "landing" | "holding" | "flying" | "done";

export interface DieTimingInput {
  /** Seconds until the next round, from the session hook; null when unknown / not in a break. */
  nextRoundStartsIn: number | null;
  /** When the caller first saw the round's letter (ms epoch); null while still secret. */
  letterArrivedAtMs: number | null;
  /** Latched by the caller the first time the stage was `tumbling` (ms epoch); null before. */
  tumbleStartedAtMs: number | null;
  /** The round's own start time (ms epoch, the SERVER's clock); null when there is no round yet. */
  roundStartedAtMs: number | null;
  /**
   * Server time minus this phone's time (`DieClockSample.offsetMs`; 0 when
   * unknown). Used only by the late-letter cutoff, so a phone clock a few
   * seconds off never skips every landing (plan Phase 12.2a).
   */
  serverClockOffsetMs: number;
  nowMs: number;
  reducedMotion: boolean;
  /** The tab was hidden at any point during this roll → skip to done. */
  hiddenDuringRoll: boolean;
}

export interface DieTiming {
  stage: DieStage;
  /** ms since this stage began (0 for idle / done). */
  stageElapsedMs: number;
  /** ms until the stage changes by time alone; null when it waits on something else (or is terminal). */
  nextStageInMs: number | null;
  /** Reduce Motion: the caller draws the static "?" tile / fade instead of the cube. */
  reduced: boolean;
}

const result = (
  stage: DieStage,
  stageElapsedMs: number,
  nextStageInMs: number | null,
  reduced: boolean
): DieTiming => ({ stage, stageElapsedMs, nextStageInMs, reduced });

/**
 * The landing hop starts at the next bounce impact on or after the letter's
 * arrival, so it always starts from the floor (prototype behaviour).
 * With no tumble (letter seen first) it starts immediately.
 */
export const landingStartMs = (
  tumbleStartedAtMs: number | null,
  letterArrivedAtMs: number
): number => {
  if (tumbleStartedAtMs === null || letterArrivedAtMs <= tumbleStartedAtMs) return letterArrivedAtMs;
  const hops = Math.ceil((letterArrivedAtMs - tumbleStartedAtMs) / DIE_HOP_MS);
  return tumbleStartedAtMs + hops * DIE_HOP_MS;
};

/** Landing stage = the hop plus the settle bounces. */
export const DIE_LANDING_TOTAL_MS = DIE_LAND_MS + DIE_SETTLE_MS;

/** Arrival → badge, worst case (wait a full hop for the impact). Average wait is DIE_HOP_MS / 2. */
export const DIE_ARRIVAL_TO_BADGE_MAX_MS = DIE_HOP_MS + DIE_LANDING_TOTAL_MS + DIE_HOLD_MS + DIE_FLY_MS;

export const dieStage = (input: DieTimingInput): DieTiming => {
  const {
    nextRoundStartsIn,
    letterArrivedAtMs,
    tumbleStartedAtMs,
    roundStartedAtMs,
    serverClockOffsetMs,
    nowMs,
    reducedMotion,
    hiddenDuringRoll,
  } = input;
  const reduced = reducedMotion;

  if (hiddenDuringRoll) return result("done", 0, null, reduced);

  // --- Letter not here yet ------------------------------------------------
  if (letterArrivedAtMs === null) {
    if (tumbleStartedAtMs !== null) {
      const elapsed = Math.max(0, nowMs - tumbleStartedAtMs);
      if (elapsed >= DIE_MAX_TUMBLE_MS) return result("done", 0, null, reduced);
      return result("tumbling", elapsed, DIE_MAX_TUMBLE_MS - elapsed, reduced);
    }
    if (nextRoundStartsIn !== null && nextRoundStartsIn <= DIE_TUMBLE_LEAD_S && nextRoundStartsIn > 0) {
      return result("tumbling", 0, null, reduced);
    }
    return result("idle", 0, null, reduced);
  }

  // --- Letter has arrived ------------------------------------------------
  // The letter showed up late (opened mid-round, or realtime dropped and the
  // poll delivered it): never hold the board for a landing on top of the time
  // already lost (plan Phase 11.1a). The arrival is moved onto the server's
  // clock first, the clock `startedAt` was written on (Phase 12.2a).
  if (
    roundStartedAtMs !== null &&
    letterArrivedAtMs + serverClockOffsetMs - roundStartedAtMs > DIE_MID_ROUND_CUTOFF_MS
  ) {
    return result("done", 0, null, reduced);
  }
  // Tumbled past the cap before the letter showed → the normal reveal handles it.
  if (tumbleStartedAtMs !== null && letterArrivedAtMs - tumbleStartedAtMs >= DIE_MAX_TUMBLE_MS) {
    return result("done", 0, null, reduced);
  }

  if (reduced) {
    // No cube: the tile is already up from the tumble lead; fade to the letter, hold, fade into the badge.
    const hold = DIE_HOLD_MS;
    const since = Math.max(0, nowMs - letterArrivedAtMs);
    if (since < hold) return result("holding", since, hold - since, true);
    if (since < hold + DIE_FLY_MS) return result("flying", since - hold, hold + DIE_FLY_MS - since, true);
    return result("done", 0, null, true);
  }

  const landAt = landingStartMs(tumbleStartedAtMs, letterArrivedAtMs);
  if (nowMs < landAt) {
    // Still bouncing, waiting for the next floor impact.
    return result("tumbling", Math.max(0, nowMs - (tumbleStartedAtMs ?? letterArrivedAtMs)), landAt - nowMs, false);
  }
  const since = nowMs - landAt;
  if (since < DIE_LANDING_TOTAL_MS) return result("landing", since, DIE_LANDING_TOTAL_MS - since, false);
  const afterLanding = since - DIE_LANDING_TOTAL_MS;
  if (afterLanding < DIE_HOLD_MS) return result("holding", afterLanding, DIE_HOLD_MS - afterLanding, false);
  const afterHold = afterLanding - DIE_HOLD_MS;
  if (afterHold < DIE_FLY_MS) return result("flying", afterHold, DIE_FLY_MS - afterHold, false);
  return result("done", 0, null, false);
};

/**
 * The phone's clock against the server's (plan Phase 12.2a), from the sessions
 * response the game already polls: `serverNowMs` is stamped just before the
 * reply, so the offset is measured at the request's midpoint and is off by at
 * most half the round trip. The fastest reading wins; a slow one (over
 * DIE_CLOCK_MAX_RTT_MS) is never used; the kept reading is replaced once it is
 * older than DIE_CLOCK_SAMPLE_MAX_AGE_MS (either way: the phone's clock may be
 * changed mid-game).
 */
export interface DieClockSample {
  /** Server time minus phone time, ms. */
  offsetMs: number;
  rttMs: number;
  /** Phone time the reply arrived. */
  takenAtMs: number;
}
/** A reading this slow could be ±1 s off: a third of DIE_MID_ROUND_CUTOFF_MS. */
export const DIE_CLOCK_MAX_RTT_MS = 2000;
/** About four 15 s polls. */
export const DIE_CLOCK_SAMPLE_MAX_AGE_MS = 60_000;

export const nextDieClockSample = (
  prev: DieClockSample | null,
  reading: { serverNowMs: unknown; sentAtMs: number; receivedAtMs: number }
): DieClockSample | null => {
  const { serverNowMs, sentAtMs, receivedAtMs } = reading;
  if (typeof serverNowMs !== "number" || !Number.isFinite(serverNowMs)) return prev;
  const rttMs = receivedAtMs - sentAtMs;
  if (!(rttMs >= 0 && rttMs <= DIE_CLOCK_MAX_RTT_MS)) return prev;
  const sample = { offsetMs: Math.round(serverNowMs - (sentAtMs + receivedAtMs) / 2), rttMs, takenAtMs: receivedAtMs };
  if (prev === null || rttMs <= prev.rttMs) return sample;
  return Math.abs(receivedAtMs - prev.takenAtMs) > DIE_CLOCK_SAMPLE_MAX_AGE_MS ? sample : prev;
};

/**
 * Filler letters for the cube's faces: only letters the game can actually pick
 * (`usableLetters`), never the real letter on a visible face — the caller puts
 * the real letter on exactly one face at landing. Deterministic given `rng`.
 */
export const pickFillerLetters = (
  usableLetters: readonly string[],
  count: number,
  rng: () => number = Math.random,
  avoid?: string
): string[] => {
  const pool = usableLetters
    .map((l) => l.toUpperCase())
    .filter((l, i, all) => l.length === 1 && all.indexOf(l) === i && l !== (avoid ?? "").toUpperCase());
  if (pool.length === 0 || count <= 0) return [];
  const out: string[] = [];
  let bag: string[] = [];
  while (out.length < count) {
    if (bag.length === 0) {
      bag = [...pool];
      // Fisher–Yates so a refill doesn't repeat the previous order.
      for (let i = bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // Avoid the same letter twice in a row across a refill.
      if (out.length > 0 && bag.length > 1 && bag[bag.length - 1] === out[out.length - 1]) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
    }
    out.push(bag.pop() as string);
  }
  return out;
};
