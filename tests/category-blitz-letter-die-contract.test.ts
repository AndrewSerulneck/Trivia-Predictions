import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// docs/category-blitz-letter-die-plan.md Phase 5: the letter die is ONE component,
// buzzes only through triggerAnimation, makes no sound and no request.

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const sourceFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });

const DIE_FILES = [
  "components/category-blitz/LetterDieRoll.tsx",
  "lib/categoryBlitzLetterDie.ts",
  "lib/categoryBlitzDieMotion.ts",
];

describe("Category Blitz letter die contract", () => {
  it("LetterDieRoll is mounted only by the game and the dev panel", () => {
    const users = ["app", "components", "lib"]
      .flatMap(sourceFiles)
      .filter((f) => /<LetterDieRoll\b/.test(read(f)))
      .sort();
    expect(users).toEqual([
      "components/category-blitz/CategoryBlitzGame.tsx",
      "components/category-blitz/DevAnimationPanel.tsx",
    ]);
  });

  it("buzzes only through triggerAnimation (no direct haptic or vibrate call)", () => {
    for (const f of DIE_FILES) {
      const src = read(f);
      expect(src, f).not.toMatch(/playHaptic|navigator\.vibrate|from "@\/lib\/haptics"|from "@\/lib\/nativeHaptics"/);
    }
    expect(read("components/category-blitz/LetterDieRoll.tsx")).toContain("triggerAnimation(");
  });

  it("has no sound", () => {
    for (const f of DIE_FILES) {
      expect(read(f), f).not.toMatch(/new Audio\(|AudioContext|\.mp3|\.wav|\.ogg|useSound|Howl/);
    }
  });

  it("makes no request", () => {
    for (const f of DIE_FILES) {
      expect(read(f), f).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|supabase/i);
    }
  });

  it("the game renders today's RoundStartReveal only when the die was skipped", () => {
    const src = read("components/category-blitz/CategoryBlitzGame.tsx");
    const at = src.indexOf("<RoundStartReveal");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, at - 700), at)).toContain("dieHoldsBoard");
  });

  it("the die lives in the game's stage, under the header, with no z-index special cases (Phase 11.2)", () => {
    const src = read("components/category-blitz/CategoryBlitzGame.tsx");
    const die = read("components/category-blitz/LetterDieRoll.tsx");
    // It fills its positioned parent, never the whole frame.
    expect(die).toContain("className={`absolute inset-0 z-10 overflow-hidden");
    expect(die).not.toMatch(/\bfixed\b/);
    // <LetterDieRoll> is inside the isolated stage, which comes after <Header.
    const header = src.lastIndexOf("<Header");
    const stage = src.indexOf("<div data-category-blitz-stage");
    expect(stage).toBeGreaterThan(header);
    expect(src.slice(stage, src.indexOf(">", stage))).toContain("relative isolate");
    expect(src.indexOf("{dieKey !== null && !dieSkipped && (\n          <LetterDieRoll")).toBeGreaterThan(stage);
    expect(src).not.toMatch(/\braised\b/);
    expect(src.match(/<ExitBackButton/g) ?? []).toHaveLength(1); // one Back, in the header
    expect(die).not.toContain("ExitBackButton");
    for (const f of sourceFiles("components/category-blitz")) {
      expect(read(f), f).not.toMatch(/z-\[11[01]0\]/);
    }
  });

  it("the dev panel's demo controls sit one step above the die and its demos are one record", () => {
    const src = read("components/category-blitz/DevAnimationPanel.tsx");
    expect(src).toContain('const DEMO_CONTROL_Z = "z-20"');
    expect(src).not.toContain("z-[1001]");
    expect(src).toContain("const LETTER_DIE_DEMOS");
    expect(src).not.toMatch(/demo === "letterDie(Late|Majority)?"/);
  });

  it("is phones only: the venue TV never imports it", () => {
    for (const f of sourceFiles("components/venue-screen")) {
      expect(read(f), f).not.toMatch(/LetterDieRoll|categoryBlitzLetterDie/);
    }
  });

  it("11.3: memoised die, stable game callbacks, one filler helper, no Reduce Motion buzz", () => {
    const die = read("components/category-blitz/LetterDieRoll.tsx");
    const game = read("components/category-blitz/CategoryBlitzGame.tsx");
    expect(die).toContain("memo(LetterDieRollInner)");
    expect(die).not.toMatch(/ref=\{\(el\)/);
    expect(die).toContain("freshFillers");
    expect(die).not.toContain("freshFiller(");
    expect(die).not.toContain("reducedLandRef");
    expect(read("lib/categoryBlitzLetterDie.ts")).not.toContain("DIE_REDUCED_MIN_HOLD_MS");
    expect(game).toMatch(/const handleDieStage = useCallback\(/);
    expect(game).toMatch(/const handleDieDone = useCallback\(/);
  });

  it("11.4: cascade rows are inert until their own fade-in completes, with one fallback timer", () => {
    const game = read("components/category-blitz/CategoryBlitzGame.tsx");
    expect(game).toContain("inert={!ready}");
    expect(game).toContain("onAnimationComplete={() => setReady(true)}");
    expect(game).toMatch(/\(delayS \+ durationS\) \* 1000 \+ 500/);
  });

  it("12.3: readiness lives in the per-row CascadeRow, and the Reduce Motion fade has one constant", () => {
    const game = read("components/category-blitz/CategoryBlitzGame.tsx");
    const motion = read("lib/categoryBlitzMotion.ts");
    expect(game).not.toContain("readyRows");
    expect(game).not.toContain("markRowReady");
    expect(game).toContain("<CascadeRow ");
    expect(motion).toContain("CB_ROW_CASCADE_REDUCED_DURATION_S = 0.2");
    expect(game).not.toMatch(/\? 0\.2 :/);
    expect(read("components/category-blitz/RoundStartReveal.tsx")).not.toMatch(/duration: 0\.2\b/);
  });

  it("12.2 / 13.5: the die, the reveal and the watchdog read the round's age on the server's clock, via roundAgeMs", () => {
    const game = read("components/category-blitz/CategoryBlitzGame.tsx");
    const die = read("lib/categoryBlitzLetterDie.ts");
    const route = read("app/api/category-blitz/sessions/route.ts");
    const hook = read("lib/categoryBlitzRealtime.ts");
    expect(route).toContain("serverNowMs: Date.now()");
    expect(hook).toContain("nextDieClockSample(");
    expect(hook).toMatch(/if \(seq < appliedLoadSeqRef\.current\) return;/);
    expect(game).toContain("serverClockOffsetMs={serverClockOffsetMs}");
    // One rule for all three (plan 13.5).
    expect(die).toMatch(/roundAgeMs\(roundStartedAtMs, letterArrivedAtMs, serverClockOffsetMs\) > DIE_MID_ROUND_CUTOFF_MS/);
    expect(game).toContain("roundAgeMs(Date.parse(answeringRoundStartedAt), nowMs, serverClockOffsetMs)");
    expect(game).toContain("roundAgeMs(Date.parse(answeringRoundStartedAt), Date.now(), serverClockOffsetRef.current)");
    expect(game).not.toMatch(/(nowMs|Date\.now\(\)) - (new Date|Date\.parse)\(answeringRoundStartedAt\)/);
    // Nothing else reads the offset: the round timer and submission deadlines keep the phone's clock (13.5 scope).
    expect(game.match(/serverClockOffsetMs/g)).toHaveLength(7);
  });
});
