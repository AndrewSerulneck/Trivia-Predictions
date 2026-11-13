// Poll idempotency for venue-display effects (docs/venue-display-hype-and-intro-stinger-plan.md §3, §8).
// Every game moment fires with a stable identity key (`gameId:round:reveal`, `roundId`, …):
//
//   - a key fires at most once per page load ("duplicate" afterwards), so a poll tick never re-fires it;
//   - keys seen before the gate is armed are remembered but not played ("swallow"). FxProvider arms the gate
//     a beat after the intro stinger ends, so the moment that was already on screen when the page loaded
//     (a reload mid-reveal) never replays — only moments that happen while someone is watching do.
//
// Pure; FxProvider owns one gate per page load.

export type FxGateDecision = "play" | "swallow" | "duplicate";

export type FxGate = {
  decide: (key: string) => FxGateDecision;
  arm: () => void;
  isArmed: () => boolean;
  size: () => number;
};

/** Oldest keys are forgotten past this (≈ a week of 75 s idle bursts); identities never recur, so it's safe. */
export const FX_GATE_MAX_KEYS = 8_000;

export const createFxGate = ({ maxKeys = FX_GATE_MAX_KEYS }: { maxKeys?: number } = {}): FxGate => {
  const seen = new Set<string>();
  let armed = false;
  return {
    decide: (key) => {
      if (seen.has(key)) return "duplicate";
      seen.add(key);
      if (seen.size > maxKeys) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      return armed ? "play" : "swallow";
    },
    arm: () => {
      armed = true;
    },
    isArmed: () => armed,
    size: () => seen.size,
  };
};
