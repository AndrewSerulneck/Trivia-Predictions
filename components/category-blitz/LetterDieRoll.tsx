"use client";

import { animate, motion, useReducedMotion } from "framer-motion";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAnimationTrigger } from "@/components/animations/AnimationTriggerProvider";
import { CB_LETTER_BADGE_LAYOUT_ID } from "@/lib/categoryBlitzMotion";
import {
  DIE_FLY_MS,
  DIE_HOP_MS,
  DIE_USABLE_LETTERS,
  dieStage,
  pickFillerLetters,
  type DieStage,
  type DieTiming,
} from "@/lib/categoryBlitzLetterDie";
import {
  DIE_HOLD_GROW_MS,
  DIE_HOLD_SCALE,
  DIE_LAND_ALIGN_AT,
  DIE_LETTER_SWAP_MS,
  DIE_MR_TINT_AT,
  DIE_SIZE_PX,
  FACE_COUNT,
  cssRotation,
  easeInOutCubic,
  faceFrontOrientation,
  faceViews,
  kickAxis,
  landingFrame,
  mostHiddenFace,
  qNorm,
  qSlerp,
  spinStep,
  squash,
  tumbleHeightPx,
  tumbleImpacts,
  type FaceView,
  type Quat,
  type Vec3,
} from "@/lib/categoryBlitzDieMotion";
import { EASE_SNAP } from "@/lib/motionEasing";
import { GAME_THEME } from "@/lib/themeTokens";

/**
 * The Category Blitz letter die (docs/category-blitz-letter-die-plan.md, Phase 3).
 *
 * An overlay that fills its positioned parent (the game's stage, below the header;
 * Phase 11.2): in the last seconds of the break a 3D cube of letters
 * drops in and tumbles; when the round's letter arrives it lands on it, holds,
 * and a flat tile carrying CB_LETTER_BADGE_LAYOUT_ID takes the front face's
 * place, so whichever element mounts next with that layoutId (the answering
 * screen's badge) FLIPs out of it. Mount it for the whole break and remount it
 * (React `key`) per roll — the latched timestamps live in here. It renders
 * nothing while idle and once done.
 *
 * Every 60 fps write (cube rotation, bounce, shading, letters) goes straight to
 * the DOM through refs (the one styling exception in CLAUDE.md): React renders
 * only on a stage change. The static face placement is Tailwind classes. Stages come from
 * `dieStage` (lib/categoryBlitzLetterDie.ts); the picture from
 * lib/categoryBlitzDieMotion.ts. Haptics only through `triggerAnimation`.
 * The px classes below assume DIE_SIZE_PX = 168 (half = 84).
 */

export interface LetterDieRollProps {
  /** The round's letter; null while it is still secret. */
  letter: string | null;
  /** Seconds until the next round (session hook); null when unknown. */
  nextRoundStartsIn: number | null;
  /** The round's start (ms epoch, server clock); null before the round exists. */
  roundStartedAtMs: number | null;
  /** Server time minus this phone's time, for the late-letter cutoff only (plan Phase 12.2a); 0 = unknown. */
  serverClockOffsetMs?: number;
  /** Majority Rules round: the die turns magenta/gold during the landing hop. */
  reverse?: boolean;
  /** Letters the game can pick (filler faces only ever show these). */
  usableLetters?: readonly string[];
  onStageChange?: (stage: DieStage) => void;
  /** Once, when the overlay is gone. `flew` = it reached the fly into the badge
   *  (false: skipped, tab hidden, letter too late, opened mid-round). */
  onDone?: (result: { flew: boolean }) => void;
}

const STANDARD = GAME_THEME.blitzStandard;
const REVERSE = GAME_THEME.blitzReverse;

const isRolling = (stage: DieStage): boolean => stage !== "idle" && stage !== "done";

interface Latches {
  tumbleStartedAtMs: number | null;
  letterArrivedAtMs: number | null;
  hiddenDuringRoll: boolean;
}

interface DieMotion {
  q: Quat;
  qSpin: Quat;
  axis: Vec3;
  lastFrameMs: number | null;
  lastSwapMs: number;
  impacts: number;
  lastImpactMs: number;
  impactStrength: number;
  letters: string[];
  target: number | null;
  targetQ: Quat | null;
  landed: boolean;
}

const newMotion = (): DieMotion => ({
  q: qNorm([1, 0.3, 0.5, 0.2]),
  qSpin: qNorm([1, 0.3, 0.5, 0.2]),
  axis: [0.8, 0.5, 0.3],
  lastFrameMs: null,
  lastSwapMs: 0,
  impacts: 0,
  lastImpactMs: Number.NEGATIVE_INFINITY,
  impactStrength: 0,
  letters: [],
  target: null,
  targetQ: null,
  landed: false,
});

const FACE_CLASS =
  "absolute inset-0 flex items-center justify-center overflow-hidden rounded-[27px] [backface-visibility:hidden]";
const GLYPH_CLASS = "relative [font-family:var(--ht-font-display)] font-black leading-none text-slate-950";
// Face placement in FACE_ORIENTATIONS order (front, back, right, left, bottom, top):
// literal strings so Tailwind sees them; tests/components.letter-die-roll.test.ts
// checks each against cssRotation(FACE_ORIENTATIONS[i]).
export const FACE_PLACEMENT_CLASSES: readonly string[] = [
  "[transform:rotateY(0deg)_translateZ(84px)]",
  "[transform:rotateY(180deg)_translateZ(84px)]",
  "[transform:rotateY(90deg)_translateZ(84px)]",
  "[transform:rotateY(-90deg)_translateZ(84px)]",
  "[transform:rotateX(90deg)_translateZ(84px)]",
  "[transform:rotateX(-90deg)_translateZ(84px)]",
];
export const CORE_PLACEMENT_CLASSES: readonly string[] = [
  "[transform:rotateY(0deg)_translateZ(78.5px)]",
  "[transform:rotateY(180deg)_translateZ(78.5px)]",
  "[transform:rotateY(90deg)_translateZ(78.5px)]",
  "[transform:rotateY(-90deg)_translateZ(78.5px)]",
  "[transform:rotateX(90deg)_translateZ(78.5px)]",
  "[transform:rotateX(-90deg)_translateZ(78.5px)]",
];
const FACE_INDEXES = Array.from({ length: FACE_COUNT }, (_, i) => i);

const LetterDieRollInner = ({
  letter,
  nextRoundStartsIn,
  roundStartedAtMs,
  serverClockOffsetMs = 0,
  reverse = false,
  usableLetters = DIE_USABLE_LETTERS,
  onStageChange,
  onDone,
}: LetterDieRollProps) => {
  const reduced = useReducedMotion() ?? false;
  const { triggerAnimation } = useAnimationTrigger();
  const [stage, setStage] = useState<DieStage>("idle");
  const [mrTint, setMrTint] = useState(false);
  const [tileUp, setTileUp] = useState(false);

  const live = useRef({ letter, nextRoundStartsIn, roundStartedAtMs, serverClockOffsetMs, reverse, reduced, usableLetters, triggerAnimation });
  const callbacks = useRef({ onStageChange, onDone });
  useLayoutEffect(() => {
    live.current = { letter, nextRoundStartsIn, roundStartedAtMs, serverClockOffsetMs, reverse, reduced, usableLetters, triggerAnimation };
    callbacks.current = { onStageChange, onDone };
  });

  const latches = useRef<Latches>({ tumbleStartedAtMs: null, letterArrivedAtMs: null, hiddenDuringRoll: false });
  const motionRef = useRef<DieMotion>(newMotion());
  const stageRef = useRef<DieStage>("idle");
  const flewRef = useRef(false);
  const mrTintRef = useRef(false);
  const tileUpRef = useRef(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const scalerRef = useRef<HTMLDivElement | null>(null);
  const cubeRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const glyphRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const shadeRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Created once: inline ref callbacks would be re-attached on every parent render.
  const [glyphRefCallbacks] = useState(() =>
    FACE_INDEXES.map((i) => (el: HTMLSpanElement | null) => {
      glyphRefs.current[i] = el;
      if (el) el.textContent = motionRef.current.letters[i] ?? "";
    })
  );
  const [shadeRefCallbacks] = useState(() =>
    FACE_INDEXES.map((i) => (el: HTMLDivElement | null) => {
      shadeRefs.current[i] = el;
    })
  );

  const writeFace = useCallback((face: number, value: string) => {
    motionRef.current.letters[face] = value;
    const glyph = glyphRefs.current[face];
    if (glyph) glyph.textContent = value;
  }, []);

  /** `count` distinct filler letters, none already on the die and none equal to `avoid`. */
  const freshFillers = useCallback((count: number, avoid: string | undefined): string[] => {
    const inUse = new Set(motionRef.current.letters.map((l) => l.toUpperCase()));
    const free = live.current.usableLetters.filter((l) => !inUse.has(l.toUpperCase()));
    return pickFillerLetters(free, count, Math.random, avoid);
  }, []);

  const bounce = useCallback((impact: number, atMs: number) => {
    const m = motionRef.current;
    m.impacts = impact;
    m.lastImpactMs = atMs;
    m.impactStrength = impact === 1 ? 1 : 0.7;
    m.axis = kickAxis(m.axis, Math.random);
    live.current.triggerAnimation("CATEGORY_BLITZ_DIE_BOUNCE");
  }, []);

  /**
   * Landing hop starts. The real letter's face is the one already showing it (letters on
   * the die are distinct, so at most one), else the face most hidden from the player.
   * Only a hidden face is ever rewritten, so no visible letter changes at landing.
   */
  const beginLanding = useCallback(
    (landStartMs: number) => {
      const m = motionRef.current;
      const real = (live.current.letter ?? "").toUpperCase();
      const showing = m.letters.indexOf(real);
      const target = showing >= 0 ? showing : mostHiddenFace(m.q);
      m.target = target;
      m.targetQ = faceFrontOrientation(target);
      m.qSpin = m.q;
      if (showing < 0) writeFace(target, real);
      const tumbleStart = latches.current.tumbleStartedAtMs;
      if (tumbleStart !== null) {
        // The landing starts on a bounce impact (landingStartMs); count it if no tumble frame did.
        const k = Math.round((landStartMs - tumbleStart) / DIE_HOP_MS);
        if (k > m.impacts) bounce(k, landStartMs);
      }
    },
    [bounce, writeFace]
  );

  const land = useCallback(() => {
    const m = motionRef.current;
    if (m.landed) return;
    m.landed = true;
    live.current.triggerAnimation("CATEGORY_BLITZ_DIE_LAND");
    const ring = ringRef.current;
    if (ring) void animate(ring, { scale: [0.5, 2.6], opacity: [0.7, 0] }, { duration: 0.55, ease: "easeOut" });
  }, []);

  const drawFrame = useCallback(
    (t: DieTiming, now: number) => {
      const wrap = wrapRef.current;
      const scaler = scalerRef.current;
      const cube = cubeRef.current;
      if (!wrap || !scaler || !cube) return;
      const m = motionRef.current;
      const p = live.current;
      const dt = m.lastFrameMs === null ? 16 : Math.min(50, Math.max(0, now - m.lastFrameMs));
      m.lastFrameMs = now;
      if (m.letters.length === 0) {
        pickFillerLetters(p.usableLetters, FACE_COUNT, Math.random).forEach((l, i) => writeFace(i, l));
      }

      let y = 0;
      let scale = 1;
      let views: FaceView[] | null = null;
      let sinceImpact: number | null = now - m.lastImpactMs;
      let strength = m.impactStrength;
      let frontShadeFade = 1;

      if (t.stage === "tumbling") {
        const tumbleStart = latches.current.tumbleStartedAtMs ?? now;
        const elapsed = now - tumbleStart;
        y = tumbleHeightPx(elapsed, DIE_SIZE_PX);
        const k = tumbleImpacts(elapsed);
        if (k > m.impacts) {
          bounce(k, tumbleStart + k * DIE_HOP_MS);
          sinceImpact = now - m.lastImpactMs;
          strength = m.impactStrength;
        }
        m.q = spinStep(m.q, m.axis, dt);
        if (now - m.lastSwapMs >= DIE_LETTER_SWAP_MS) {
          m.lastSwapMs = now;
          views = faceViews(m.q);
          const hiddenFaces = views.flatMap((view, i) => (view.hidden ? [i] : []));
          // One pass: letters on the die now stay out of the pool, so the hidden faces
          // get distinct new ones, never the round's letter.
          freshFillers(hiddenFaces.length, p.letter ?? undefined).forEach((next, k) => writeFace(hiddenFaces[k], next));
        }
      } else if (t.stage === "landing") {
        if (m.target === null) beginLanding(now - t.stageElapsedMs);
        const frame = landingFrame(t.stageElapsedMs, DIE_SIZE_PX);
        y = frame.heightPx;
        const targetQ = m.targetQ ?? m.q;
        if (frame.hopProgress < 1) {
          m.qSpin = spinStep(m.qSpin, m.axis, dt, Math.pow(1 - frame.hopProgress, 1.5));
          m.q = qSlerp(m.qSpin, targetQ, easeInOutCubic(Math.min(1, frame.hopProgress / DIE_LAND_ALIGN_AT)));
          sinceImpact = now - m.lastImpactMs;
          strength = m.impactStrength;
          if (p.reverse && !mrTintRef.current && frame.hopProgress >= DIE_MR_TINT_AT) {
            mrTintRef.current = true;
            setMrTint(true);
          }
        } else {
          m.q = targetQ;
          land();
          sinceImpact = frame.sinceImpactMs;
          strength = frame.impactStrength;
        }
      } else {
        // holding / flying: the letter faces the player, upright.
        if (m.target === null) beginLanding(now);
        land();
        if (p.reverse && !mrTintRef.current) {
          mrTintRef.current = true;
          setMrTint(true);
        }
        m.q = m.targetQ ?? m.q;
        const grow = t.stage === "holding" ? easeInOutCubic(Math.min(1, t.stageElapsedMs / DIE_HOLD_GROW_MS)) : 1;
        scale = 1 + (DIE_HOLD_SCALE - 1) * grow;
        frontShadeFade = 1 - grow;
        if (!tileUpRef.current && (t.stage === "flying" || t.stageElapsedMs >= DIE_HOLD_GROW_MS)) {
          tileUpRef.current = true;
          setTileUp(true);
        }
      }

      cube.style.transform = cssRotation(m.q);
      (views ?? faceViews(m.q)).forEach((view, i) => {
        const shade = shadeRefs.current[i];
        if (shade) shade.style.opacity = (i === m.target ? view.shade * frontShadeFade : view.shade).toFixed(3);
      });
      const [sx, sy] = squash(sinceImpact, strength);
      wrap.style.transform = `translate3d(0, ${(-y).toFixed(2)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
      scaler.style.transform = `scale(${scale.toFixed(4)})`;
      const shadow = shadowRef.current;
      if (shadow) {
        const hRel = Math.min(1, y / (DIE_SIZE_PX * 1.4));
        shadow.style.transform = `scale(${(1 - 0.55 * hRel).toFixed(3)})`;
        shadow.style.opacity = (1 - 0.7 * hRel).toFixed(3);
      }
    },
    [beginLanding, bounce, freshFillers, land, writeFace]
  );

  /** One evaluation: latch the tumble, move the stage, draw. */
  const step = useCallback(
    (now: number): DieTiming => {
      const p = live.current;
      const l = latches.current;
      const input = {
        nextRoundStartsIn: p.nextRoundStartsIn,
        letterArrivedAtMs: l.letterArrivedAtMs,
        tumbleStartedAtMs: l.tumbleStartedAtMs,
        roundStartedAtMs: p.roundStartedAtMs,
        serverClockOffsetMs: p.serverClockOffsetMs,
        nowMs: now,
        reducedMotion: p.reduced,
        hiddenDuringRoll: l.hiddenDuringRoll,
      };
      let timing = dieStage(input);
      if (timing.stage === "tumbling" && l.tumbleStartedAtMs === null && l.letterArrivedAtMs === null) {
        l.tumbleStartedAtMs = now;
        timing = dieStage({ ...input, tumbleStartedAtMs: now });
      }
      // A finished roll never restarts (remount per roll).
      if (stageRef.current === "done") return { ...timing, stage: "done" };
      if (timing.stage !== stageRef.current) {
        stageRef.current = timing.stage;
        if (timing.stage === "flying") flewRef.current = true;
        setStage(timing.stage);
        // Straight from the frame, not from a render: the parent hears every stage
        // even when React batches two of them, and can mount the badge in the same frame.
        callbacks.current.onStageChange?.(timing.stage);
        if (timing.stage === "done") callbacks.current.onDone?.({ flew: flewRef.current });
      }
      if (!p.reduced && isRolling(timing.stage)) drawFrame(timing, now);
      return timing;
    },
    [drawFrame]
  );

  // Props moved (the countdown ticks, the letter arrives): evaluate on the next frame.
  useEffect(() => {
    if (letter && latches.current.letterArrivedAtMs === null) latches.current.letterArrivedAtMs = Date.now();
    const id = window.requestAnimationFrame(() => step(Date.now()));
    return () => window.cancelAnimationFrame(id);
  }, [letter, nextRoundStartsIn, roundStartedAtMs, serverClockOffsetMs, reduced, step]);

  // While rolling: the frame loop, and "tab hidden during the roll → skip to done".
  const rolling = isRolling(stage);
  useEffect(() => {
    if (!rolling) return;
    let id = 0;
    const loop = () => {
      if (isRolling(step(Date.now()).stage)) id = window.requestAnimationFrame(loop);
    };
    id = window.requestAnimationFrame(loop);
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      latches.current.hiddenDuringRoll = true;
      step(Date.now());
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [rolling, step]);

  if (!rolling) return null;

  const flying = stage === "flying";
  const arrived = letter !== null;
  const shownLetter = (letter ?? "").toUpperCase();
  const tint = mrTint ? "opacity-100" : "opacity-0";
  const untint = mrTint ? "opacity-0" : "opacity-100";
  const tileGradient = reverse && (mrTint || reduced) ? REVERSE.letterGradient : STANDARD.letterGradient;
  const countdown = nextRoundStartsIn !== null && nextRoundStartsIn > 0 ? String(Math.ceil(nextRoundStartsIn)) : "…";

  return (
    <div
      data-category-blitz-letter-die
      className={`absolute inset-0 z-10 overflow-hidden ${flying ? "pointer-events-none" : ""}`}
    >
      <span role="status" className="sr-only">
        {arrived ? `Round letter: ${shownLetter}` : "Rolling the letter"}
      </span>

      {/* Backdrop: fades while the letter flies so the badge underneath shows through. */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: flying ? 0 : 1 }}
        transition={{ duration: flying ? (DIE_FLY_MS * 0.8) / 1000 : 0.28, ease: "easeOut" }}
      >
        <div className={`absolute inset-0 ${STANDARD.pageBg}`} />
        <div className={`absolute inset-0 ${REVERSE.pageBg} transition-opacity duration-500 ${tint}`} />
        <div className={`absolute inset-0 ${STANDARD.dieGlow} transition-opacity duration-500 ${untint}`} />
        <div className={`absolute inset-0 ${REVERSE.dieGlow} transition-opacity duration-500 ${tint}`} />
      </motion.div>

      {/* Anchor = the die's resting centre and the vanishing point. No opacity,
          overflow or filter on it or below it: iOS would flatten the 3D. */}
      <div aria-hidden className="absolute left-1/2 top-[44%] h-0 w-0 [perspective:900px]">
        {!reduced && (
          <>
            <div
              ref={shadowRef}
              className={`absolute -left-[80px] top-[73px] h-[22px] w-[160px] rounded-full bg-[radial-gradient(closest-side,rgba(0,0,0,0.6),transparent)] ${
                flying ? "invisible" : ""
              }`}
            />
            <div
              ref={ringRef}
              className={`absolute -left-[76px] -top-[76px] h-[152px] w-[152px] rounded-full border-2 opacity-0 ${
                mrTint ? REVERSE.dieRing : STANDARD.dieRing
              }`}
            />
            <div
              ref={wrapRef}
              className="absolute -left-[84px] -top-[84px] h-[168px] w-[168px] origin-bottom [transform-style:preserve-3d] will-change-transform"
            >
              <div ref={scalerRef} className="absolute inset-0 [transform-style:preserve-3d]">
                <div
                  ref={cubeRef}
                  className={`absolute inset-0 [transform-style:preserve-3d] will-change-transform ${
                    tileUp ? "invisible" : ""
                  }`}
                >
                  {/* Inner core (0.94×) so the rounded face corners never show a gap. */}
                  {FACE_INDEXES.map((i) => (
                    <div
                      key={`core-${i}`}
                      className={`absolute left-[5px] top-[5px] h-[158px] w-[158px] [backface-visibility:hidden] transition-colors duration-500 ${
                        CORE_PLACEMENT_CLASSES[i]
                      } ${mrTint ? REVERSE.dieCore : STANDARD.dieCore
                      }`}
                    />
                  ))}
                  {FACE_INDEXES.map((i) => (
                    <div
                      key={`face-${i}`}
                      className={`${FACE_CLASS} ${FACE_PLACEMENT_CLASSES[i]} ${STANDARD.letterGradient}`}
                    >
                      <div className={`absolute inset-0 ${REVERSE.letterGradient} transition-opacity duration-500 ${tint}`} />
                      <span
                        ref={glyphRefCallbacks[i]}
                        className={`${GLYPH_CLASS} text-[104px]`}
                      />
                      <div
                        ref={shadeRefCallbacks[i]}
                        className="absolute inset-0 bg-black opacity-0"
                      />
                    </div>
                  ))}
                </div>
              </div>
              {/* The held letter as a flat tile the size of the front face at hold
                  (DIE_HOLD_TILE_PX ≈ 196): the FLIP source for the badge. */}
              {tileUp && (
                <div className="absolute -left-[14px] -top-[14px] h-[196px] w-[196px]">
                  <motion.div
                    layoutId={CB_LETTER_BADGE_LAYOUT_ID}
                    transition={{ layout: { duration: DIE_FLY_MS / 1000, ease: EASE_SNAP } }}
                    className={`flex h-full w-full items-center justify-center rounded-[31px] ${tileGradient} ${
                      mrTint ? REVERSE.letterGlow : STANDARD.letterGlow
                    }`}
                  >
                    <span className={`${GLYPH_CLASS} text-[122px]`}>{shownLetter}</span>
                  </motion.div>
                </div>
              )}
            </div>
            <p
              className={`absolute left-0 top-[114px] w-max -translate-x-1/2 text-center text-footnote font-black text-slate-400 tabular-nums transition-opacity duration-200 ${
                arrived ? "opacity-0" : "opacity-100"
              }`}
            >
              Rolling the letter
              <span className="block text-[28px] leading-tight text-slate-200">{countdown}</span>
            </p>
          </>
        )}

        {reduced && (
          <>
            {/* Reduce Motion: no die. A still "?" tile cross-fades to the letter, holds, then fades away. */}
            <motion.div
              className={`absolute -left-[84px] -top-[84px] flex h-[168px] w-[168px] items-center justify-center rounded-[27px] ${tileGradient}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: flying ? 0 : 1 }}
              transition={{ duration: flying ? DIE_FLY_MS / 1000 : 0.25 }}
            >
              <motion.span
                key={stage === "tumbling" ? "secret" : "letter"}
                className={`${GLYPH_CLASS} text-[104px]`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
              >
                {stage === "tumbling" ? "?" : shownLetter}
              </motion.span>
            </motion.div>
            <p
              className={`absolute left-0 top-[114px] w-max -translate-x-1/2 text-center text-footnote font-black text-slate-400 tabular-nums ${
                arrived ? "invisible" : ""
              }`}
            >
              Rolling the letter
              <span className="block text-[28px] leading-tight text-slate-200">{countdown}</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

// memo: the parent re-renders about 4x a second; the die reads its callbacks through a ref.
const LetterDieRoll = memo(LetterDieRollInner);

export default LetterDieRoll;
