import { describe, expect, it } from "vitest";
import {
  DIE_FLY_MS,
  DIE_HOLD_MS,
  DIE_HOP_MS,
  DIE_LANDING_TOTAL_MS,
  DIE_MAX_TUMBLE_MS,
  DIE_MID_ROUND_CUTOFF_MS,
  DIE_TUMBLE_LEAD_S,
  DIE_CLOCK_MAX_RTT_MS,
  DIE_CLOCK_SAMPLE_MAX_AGE_MS,
  DIE_USABLE_LETTERS,
  dieStage,
  landingStartMs,
  nextDieClockSample,
  pickFillerLetters,
  type DieClockSample,
  type DieTimingInput,
} from "@/lib/categoryBlitzLetterDie";
import { ROUND_START_REVEAL_MAX_MS } from "@/components/category-blitz/RoundStartReveal";
import letterIndex from "@/data/category-blitz/category-letter-index.json";

const T0 = 1_000_000;
const base: DieTimingInput = {
  nextRoundStartsIn: null,
  letterArrivedAtMs: null,
  tumbleStartedAtMs: null,
  roundStartedAtMs: null,
  serverClockOffsetMs: 0,
  nowMs: T0,
  reducedMotion: false,
  hiddenDuringRoll: false,
};
const at = (over: Partial<DieTimingInput>) => dieStage({ ...base, ...over });

describe("tumble start", () => {
  it("is idle until the lead window", () => {
    expect(at({ nextRoundStartsIn: DIE_TUMBLE_LEAD_S + 1 }).stage).toBe("idle");
    expect(at({ nextRoundStartsIn: null }).stage).toBe("idle");
  });
  it("tumbles at ≤ 5 s and stays tumbling once latched", () => {
    expect(at({ nextRoundStartsIn: 5 }).stage).toBe("tumbling");
    expect(at({ nextRoundStartsIn: 0.4, tumbleStartedAtMs: T0 - 4600 }).stage).toBe("tumbling");
  });
  it("a late letter keeps tumbling up to the cap, then gives up", () => {
    const t = at({ tumbleStartedAtMs: T0 - (DIE_MAX_TUMBLE_MS - 1), nowMs: T0 });
    expect(t.stage).toBe("tumbling");
    expect(t.nextStageInMs).toBe(1);
    expect(at({ tumbleStartedAtMs: T0 - DIE_MAX_TUMBLE_MS }).stage).toBe("done");
  });
});

describe("landing sequence", () => {
  const tumble = T0 - 2000;
  it("lands at the next bounce impact, never mid-air", () => {
    const arrived = tumble + 1300; // between impacts at 1040 and 1560
    expect(landingStartMs(tumble, arrived)).toBe(tumble + 3 * DIE_HOP_MS);
    expect(landingStartMs(tumble, tumble + 2 * DIE_HOP_MS)).toBe(tumble + 2 * DIE_HOP_MS);
    const waiting = dieStage({ ...base, tumbleStartedAtMs: tumble, letterArrivedAtMs: arrived, nowMs: arrived + 10 });
    expect(waiting.stage).toBe("tumbling");
    expect(waiting.nextStageInMs).toBe(tumble + 3 * DIE_HOP_MS - (arrived + 10));
  });
  it("walks landing → holding → flying → done", () => {
    const arrived = tumble + 2 * DIE_HOP_MS; // exactly on an impact
    const run = (dt: number) =>
      dieStage({ ...base, tumbleStartedAtMs: tumble, letterArrivedAtMs: arrived, nowMs: arrived + dt });
    expect(run(0).stage).toBe("landing");
    expect(run(DIE_LANDING_TOTAL_MS - 1).stage).toBe("landing");
    expect(run(DIE_LANDING_TOTAL_MS).stage).toBe("holding");
    expect(run(DIE_LANDING_TOTAL_MS + DIE_HOLD_MS).stage).toBe("flying");
    const done = run(DIE_LANDING_TOTAL_MS + DIE_HOLD_MS + DIE_FLY_MS);
    expect(done.stage).toBe("done");
    expect(done.nextStageInMs).toBeNull();
    expect(run(DIE_LANDING_TOTAL_MS + 100).stageElapsedMs).toBe(100);
  });
  it("letter seen with no tumble lands immediately", () => {
    const t = at({ letterArrivedAtMs: T0, roundStartedAtMs: T0 - 200 });
    expect(t.stage).toBe("landing");
  });
  it("arrival → badge stays near 2.5 s on average", () => {
    const avg = DIE_HOP_MS / 2 + DIE_LANDING_TOTAL_MS + DIE_HOLD_MS + DIE_FLY_MS;
    expect(avg).toBeGreaterThan(2200);
    expect(avg).toBeLessThan(2800);
  });
});

describe("no replay / skip rules", () => {
  it("opened mid-round (never tumbled, round older than the reveal window) → done", () => {
    expect(
      at({ letterArrivedAtMs: T0, roundStartedAtMs: T0 - DIE_MID_ROUND_CUTOFF_MS - 1 }).stage
    ).toBe("done");
  });
  it("the cutoff matches the reveal's max duration", () => {
    expect(DIE_MID_ROUND_CUTOFF_MS).toBe(ROUND_START_REVEAL_MAX_MS);
  });
  // Plan Phase 11.1a: the cutoff is measured at the letter's ARRIVAL, tumble or not.
  it("a letter first seen late is done even after a tumble", () => {
    const roundStart = T0;
    const t = at({
      tumbleStartedAtMs: roundStart - 5000,
      letterArrivedAtMs: roundStart + 3500,
      roundStartedAtMs: roundStart,
      nowMs: roundStart + 3500,
    });
    expect(t.stage).toBe("done");
  });
  it("a letter seen on time keeps holding/flying past the cutoff (never cut by \"now\")", () => {
    const roundStart = T0;
    const input = {
      tumbleStartedAtMs: roundStart - 5000,
      // Lands at the impact at +1240, holds +2340…+3040, flies until +3490.
      letterArrivedAtMs: roundStart + 1000,
      roundStartedAtMs: roundStart,
    };
    const atNow = (dt: number) => at({ ...input, nowMs: roundStart + dt }).stage;
    expect(atNow(2900)).toBe("holding");
    expect(atNow(DIE_MID_ROUND_CUTOFF_MS + 100)).toBe("flying");
  });
  it("a letter at exactly the cutoff still lands", () => {
    const t = at({ letterArrivedAtMs: T0, roundStartedAtMs: T0 - DIE_MID_ROUND_CUTOFF_MS, nowMs: T0 });
    expect(t.stage).toBe("landing");
  });
  // Plan Phase 12.2a: the cutoff compares the arrival on the SERVER's clock.
  // serverClockOffsetMs = server − phone, so a phone 4 s ahead is −4000.
  describe("phone clock off", () => {
    const roundStart = T0; // server clock
    const tumbled = (phoneAheadMs: number, lateMs: number, offset: number) =>
      at({
        tumbleStartedAtMs: roundStart + phoneAheadMs - 5000,
        letterArrivedAtMs: roundStart + phoneAheadMs + lateMs,
        roundStartedAtMs: roundStart,
        serverClockOffsetMs: offset,
        nowMs: roundStart + phoneAheadMs + lateMs,
      }).stage;
    it("phone 4 s ahead, round on time → the die lands", () => {
      expect(tumbled(4000, 200, -4000)).not.toBe("done");
      expect(tumbled(4000, 200, 0)).toBe("done"); // the bug without the offset
    });
    it("correct clock, letter 6 s late → done (11.1a still holds)", () => {
      expect(tumbled(0, 6000, 0)).toBe("done");
    });
    it("phone 4 s behind, letter 6 s late → done", () => {
      expect(tumbled(-4000, 6000, 4000)).toBe("done");
      expect(tumbled(-4000, 6000, 0)).not.toBe("done"); // the miss without the offset
    });
  });
  it("hidden tab during the roll → done, in any state", () => {
    expect(at({ nextRoundStartsIn: 3, hiddenDuringRoll: true }).stage).toBe("done");
    expect(at({ tumbleStartedAtMs: T0 - 500, letterArrivedAtMs: T0, hiddenDuringRoll: true }).stage).toBe("done");
  });
  it("letter that shows after the cap → done", () => {
    expect(
      at({ tumbleStartedAtMs: T0 - DIE_MAX_TUMBLE_MS - 500, letterArrivedAtMs: T0, roundStartedAtMs: T0 }).stage
    ).toBe("done");
  });
});

describe("Reduce Motion", () => {
  it("flags reduced and never enters landing", () => {
    const arrived = T0;
    const run = (dt: number) =>
      at({ reducedMotion: true, tumbleStartedAtMs: arrived - 1000, letterArrivedAtMs: arrived, nowMs: arrived + dt });
    expect(run(0)).toMatchObject({ stage: "holding", reduced: true });
    expect(run(DIE_HOLD_MS).stage).toBe("flying");
    expect(run(DIE_HOLD_MS + DIE_FLY_MS).stage).toBe("done");
    for (let dt = 0; dt < 3000; dt += 50) expect(run(dt).stage).not.toBe("landing");
  });
  it("still shows the static tile while waiting", () => {
    expect(at({ reducedMotion: true, nextRoundStartsIn: 4 })).toMatchObject({ stage: "tumbling", reduced: true });
  });
});

describe("pickFillerLetters", () => {
  const usable = letterIndex.usableLetters as string[];
  it("only ever returns usable letters, never the avoided one", () => {
    const out = pickFillerLetters(usable, 200, Math.random, "E");
    expect(out).toHaveLength(200);
    for (const l of out) {
      expect(usable).toContain(l);
      expect(l).not.toBe("E");
    }
  });
  it("never repeats a letter back to back and is deterministic for a seeded rng", () => {
    let s = 7;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const a = pickFillerLetters(usable, 100, rng);
    for (let i = 1; i < a.length; i += 1) expect(a[i]).not.toBe(a[i - 1]);
    s = 7;
    expect(pickFillerLetters(usable, 100, rng)).toEqual(a);
  });
  it("the die's built-in letter list is exactly the game's usable letters (standard and Majority Rules)", () => {
    expect([...DIE_USABLE_LETTERS]).toEqual(letterIndex.usableLetters);
    expect([...DIE_USABLE_LETTERS]).toEqual(letterIndex.bUsableLetters);
  });
  it("returns [] for an empty pool", () => {
    expect(pickFillerLetters([], 5)).toEqual([]);
  });
});

// Plan Phase 12.2a: the clock offset from the sessions replies.
describe("nextDieClockSample", () => {
  const read = (serverNowMs: unknown, sentAtMs: number, receivedAtMs: number) => ({ serverNowMs, sentAtMs, receivedAtMs });
  it("measures at the request's midpoint", () => {
    expect(nextDieClockSample(null, read(T0 + 5100, T0, T0 + 200))).toEqual({ offsetMs: 5000, rttMs: 200, takenAtMs: T0 + 200 });
  });
  it("ignores a reply with no usable serverNowMs (an older server)", () => {
    const prev: DieClockSample = { offsetMs: 7, rttMs: 100, takenAtMs: T0 };
    expect(nextDieClockSample(null, read(undefined, T0, T0 + 50))).toBeNull();
    expect(nextDieClockSample(prev, read("x", T0, T0 + 50))).toBe(prev);
    expect(nextDieClockSample(prev, read(Number.NaN, T0, T0 + 50))).toBe(prev);
  });
  it("never uses a slow or impossible round trip", () => {
    expect(nextDieClockSample(null, read(T0, T0, T0 + DIE_CLOCK_MAX_RTT_MS + 1))).toBeNull();
    expect(nextDieClockSample(null, read(T0, T0, T0 + DIE_CLOCK_MAX_RTT_MS))).not.toBeNull();
    expect(nextDieClockSample(null, read(T0, T0, T0 - 1))).toBeNull();
  });
  it("keeps the fastest reading", () => {
    const fast = nextDieClockSample(null, read(T0 + 1000, T0, T0 + 100));
    expect(nextDieClockSample(fast, read(T0 + 9000, T0 + 1000, T0 + 1400))).toBe(fast);
    const faster = nextDieClockSample(fast, read(T0 + 2000, T0 + 1000, T0 + 1050));
    expect(faster?.rttMs).toBe(50);
  });
  it("replaces a kept reading once it is old, either way (the phone's clock was changed)", () => {
    const fast = nextDieClockSample(null, read(T0 + 1000, T0, T0 + 100));
    const later = T0 + 100 + DIE_CLOCK_SAMPLE_MAX_AGE_MS + 1;
    expect(nextDieClockSample(fast, read(later + 3000, later - 400, later))?.offsetMs).toBe(3200);
    const earlier = T0 + 100 - DIE_CLOCK_SAMPLE_MAX_AGE_MS - 1;
    expect(nextDieClockSample(fast, read(earlier, earlier - 400, earlier))?.offsetMs).toBe(200);
    expect(nextDieClockSample(fast, read(T0 + 9000, T0 + 1000, T0 + 1400))).toBe(fast);
  });
});
