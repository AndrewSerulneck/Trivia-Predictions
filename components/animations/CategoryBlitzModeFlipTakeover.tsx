"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion, useTransform, type Easing, type MotionValue } from "framer-motion";
import { MODE_CONFIG, DEFAULT_MODE_FLIP_VARIANT, type ModeFlipVariant } from "@/lib/categoryBlitzModes";
import type { GameplayAnimationProps } from "@/types/animation";

/**
 * Full-screen "entering Blend In!" announcement (docs/category-blitz-mode-b-plan.md
 * §4b / §7a), the sibling of the persistent ModeSign indicator. Three flip
 * treatments ship at once behind a dev-selectable variant (lib/categoryBlitzModes.ts)
 * so the winner can be picked by feel in the live app.
 *
 * Only ever plays for the standard → reverse transition (see the trigger site in
 * CategoryBlitzGame.tsx) — reverting to standard scoring relies on the ModeSign
 * flip + ambient board theme shift alone, so players aren't hit with a second
 * full-screen takeover every single round.
 *
 * The hero text is always MODE_CONFIG[...].puckLabel — never an invented mode
 * name — per the plan's "no player-facing mode names" rule.
 *
 * 3D technique (see docs/category-blitz-mode-flip-animation-fix-plan.md): the
 * flip runs on the shared `.tp-3d-*` primitives — a `filter` never sits on a
 * `preserve-3d` node, the rotating layer is a direct child of its perspective
 * host, and faces carry real `translateZ` depth + prefixed backface hiding. All
 * three variants land flat on the reverse "Blend In!" face (rotation ≡ 180° mod
 * 360°), so the backface never flashes.
 */
const HOLD_MS = 3500;
const DISSOLVE_MS = 650;
const SLAT_COUNT = 10;
// Half-thickness pushed onto each face (px). Two faces at ±d + side walls of
// width 2d make the card read as a solid slab turning through space, not two
// decals z-fighting at Z=0.
const FACE_DEPTH_PX = 8;
// How far (deg) the split-flap wave is spread across its slats: the last slat
// starts this many degrees after the first, so the flip reads as a travelling
// wave rather than one card. `progress` runs to 180 + this so every slat still
// completes its own 0→180 turn and lands flat on the reverse face.
const SPLITFLAP_STAGGER_DEG = 120;

type VariantAnim = {
  /** rotateY keyframes (deg). Final value must be ≡ 180° (mod 360°) so the flip
   *  lands flat on the reverse face. */
  keyframes: number[];
  times: number[];
  ease: Easing | Easing[];
  durationMs: number;
  /** Landing rotation used to normalise the motion-blur curve. */
  landDeg: number;
  shake: boolean;
};

const VARIANT_ANIM: Record<ModeFlipVariant, VariantAnim> = {
  // Single deliberate turn: a small wind-back (anticipation), swing through, a
  // touch of overshoot, then settle onto the reverse face.
  card: {
    keyframes: [0, -18, 198, 180],
    times: [0, 0.14, 0.74, 1],
    ease: ["easeOut", "easeIn", "easeOut"],
    durationMs: 1300,
    landDeg: 180,
    shake: false,
  },
  // One shared driver runs to 180 + stagger; each slat clamps its own turn to
  // [0,180] (see SplitFlapSlat), so the wave finishes with every slat flat.
  splitFlap: {
    keyframes: [0, 180 + SPLITFLAP_STAGGER_DEG],
    times: [0, 1],
    ease: "easeInOut",
    durationMs: 1050,
    landDeg: 180,
    shake: false,
  },
  // 1.5 full turns = 540° (odd multiple of 180 → lands flat on the reverse
  // face), with a small overshoot that settles back. Motion-blur peaks at the
  // fast mid-spin; screen-shake + landing flash punctuate the impact.
  overspin: {
    keyframes: [0, 560, 540],
    times: [0, 0.86, 1],
    ease: ["easeIn", "easeOut"],
    durationMs: 1150,
    landDeg: 540,
    shake: true,
  },
};

/** Pure face content that fills its wrapper. Positioning, depth (translateZ)
 *  and backface hiding are owned by the wrapping divs below so the same content
 *  can be reused by every variant and every 3D wrapper. */
const Face = ({ side }: { side: "standard" | "reverse" }) => {
  const isReverse = side === "reverse";
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-4 px-8 text-center ${
        isReverse
          ? "bg-[radial-gradient(125%_95%_at_50%_6%,#ff5cb1_0%,#ff2d95_26%,#a10d63_52%,#2c0018_84%,#12000a_100%)]"
          : "bg-[radial-gradient(125%_95%_at_50%_8%,#2b5fd4_0%,#16337f_34%,#071233_68%,#020617_100%)]"
      }`}
    >
      <p className={`font-mono text-xs uppercase tracking-[0.3em] ${isReverse ? "text-amber-300" : "text-sky-300"}`}>
        {isReverse ? "Reverse Round!" : "This round"}
      </p>
      <h1
        className={`font-['Bree_Serif',_Georgia,_serif] text-[13vw] font-normal leading-[0.92] sm:text-6xl ${
          isReverse
            ? "text-amber-50 drop-shadow-[0_0_60px_rgba(255,197,61,0.55)]"
            : "text-blue-50 drop-shadow-[0_0_44px_rgba(59,130,246,0.55)]"
        }`}
      >
        {MODE_CONFIG[side].puckLabel}
      </h1>
      <p className={`max-w-[40ch] text-sm sm:text-base ${isReverse ? "text-amber-50/90" : "text-sky-100/80"}`}>
        {MODE_CONFIG[side].rule}
      </p>
    </div>
  );
};

/** The card's left/right side walls, giving it real thickness at the ~90°
 *  crossover. Each wall is a thin strip hinged on the card edge and swung into
 *  depth; edge-on at rest (invisible), it faces the viewer mid-turn. */
const EdgeWall = ({ side }: { side: "left" | "right" }) => (
  <div
    className={`absolute inset-y-0 bg-gradient-to-b from-slate-200/40 via-slate-500/30 to-slate-900/50 ${
      side === "left" ? "left-0" : "right-0"
    }`}
    style={{
      width: `${FACE_DEPTH_PX * 2}px`,
      transformOrigin: side === "left" ? "left center" : "right center",
      transform: side === "left" ? "rotateY(90deg)" : "rotateY(-90deg)",
    }}
  />
);

/** Single 3D flip card used by the "card" and "overspin" variants. `filter`
 *  (the motion-blur) sits on this NON-3D wrapper so it can never flatten
 *  `preserve-3d`; the rotating `.tp-3d-layer` is a DIRECT child of the
 *  `.tp-3d-scene`; faces are pushed out on Z with `.tp-backface-hidden` and the
 *  two EdgeWalls close the slab. */
const FlipCard = ({ rotateY, filter }: { rotateY: MotionValue<number>; filter: MotionValue<string> }) => (
  <motion.div className="absolute inset-0" style={{ filter }}>
    <div className="tp-3d-scene absolute inset-0">
      <motion.div className="tp-3d-layer relative h-full w-full" style={{ rotateY }}>
        <div className="tp-backface-hidden absolute inset-0" style={{ transform: `translateZ(${FACE_DEPTH_PX}px)` }}>
          <Face side="standard" />
        </div>
        <div className="tp-backface-hidden absolute inset-0" style={{ transform: `rotateY(180deg) translateZ(${FACE_DEPTH_PX}px)` }}>
          <Face side="reverse" />
        </div>
        <EdgeWall side="left" />
        <EdgeWall side="right" />
      </motion.div>
    </div>
  </motion.div>
);

/** The "split-flap" variant: a row of slats sharing one driver, each a
 *  phase-shifted window of the same turn so the flip reads as a travelling wave.
 *  Each slat shows its own vertical slice of the full-screen Face (offset via a
 *  per-index inline `left` — the one thing Tailwind genuinely cannot express,
 *  the same pattern SubmitLockAnimation/CorrectBurst use for per-item values). */
const SplitFlap = ({ progress }: { progress: MotionValue<number> }) => {
  const slats = useMemo(() => Array.from({ length: SLAT_COUNT }, (_, i) => i), []);
  return (
    <div className="absolute inset-0 flex">
      {slats.map((i) => (
        <SplitFlapSlat key={i} index={i} progress={progress} />
      ))}
    </div>
  );
};

const SplitFlapSlat = ({ index, progress }: { index: number; progress: MotionValue<number> }) => {
  const offset = (index / SLAT_COUNT) * SPLITFLAP_STAGGER_DEG;
  // This slat's own 0→180 turn, delayed by its stagger offset and clamped so it
  // always lands flat on the reverse face even though the shared driver runs past 180.
  const rotateY = useTransform(progress, (v) => Math.max(0, Math.min(180, v - offset)));
  // Vertical axis this slat turns around = the centre of its own column, as a
  // fraction of the full-width rotating layer. The motion layer takes it via
  // framer's own `originX` prop (a raw `style.transformOrigin` on a motion
  // element is overridden by framer), the plain back-face div takes the matching
  // CSS percentage — they MUST share one axis or the two 180° turns don't compose
  // to identity and the slice never lands back in its column.
  const originFraction = (index + 0.5) / SLAT_COUNT;
  const backfaceOrigin = `${originFraction * 100}% 50%`;

  // All sizing is in PERCENT of the takeover container, never `vw`: this
  // component renders inside `.tp-page-main`, which is offset from the viewport
  // (a transformed ancestor) so `vw` doesn't equal the takeover's width. Each
  // clip is one column (100/SLAT_COUNT %); the rotating layer is the FULL width
  // (SLAT_COUNT × that) pulled left by `index` columns so it lines up with the
  // whole takeover, and — together with its pre-rotated back face — turns around
  // this slat's OWN column-centre axis. Sharing that one axis is what makes the
  // flip land: back-face 180° + layer 180° = a 360° turn about the same line =
  // identity, so the reverse slice drops back exactly into this column.
  //
  // `maxWidth:"none"` is required inline: the global rule
  // `.tp-page-main :where(…, div, …) { max-width: 100% }` (globals.css) otherwise
  // clamps the >100%-wide layer back to one column — the bug that left every slat
  // but the first showing dark on landing. Inline style beats that (non-important)
  // rule; a `max-w-none` class would only tie on specificity and lose on order.
  return (
    <div className="relative h-full overflow-hidden" style={{ width: `${100 / SLAT_COUNT}%` }}>
      <div className="tp-3d-scene absolute inset-0">
        <motion.div
          className="tp-3d-layer absolute inset-y-0"
          style={{
            rotateY,
            width: `${SLAT_COUNT * 100}%`,
            left: `${-index * 100}%`,
            maxWidth: "none",
            originX: originFraction,
            originY: 0.5,
          }}
        >
          <div className="tp-backface-hidden absolute inset-0" style={{ transform: `translateZ(${FACE_DEPTH_PX}px)` }}>
            <Face side="standard" />
          </div>
          <div
            className="tp-backface-hidden absolute inset-0"
            style={{ transform: `rotateY(180deg) translateZ(${FACE_DEPTH_PX}px)`, transformOrigin: backfaceOrigin }}
          >
            <Face side="reverse" />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const CategoryBlitzModeFlipTakeover = ({ onComplete, payload }: GameplayAnimationProps) => {
  const reduce = useReducedMotion() ?? false;
  const variant: ModeFlipVariant = payload?.modeFlipVariant ?? DEFAULT_MODE_FLIP_VARIANT;
  const anim = VARIANT_ANIM[variant];

  const progress = useMotionValue(0);
  // Bell-curve motion-blur peaking at the fast mid-spin — only visibly non-zero
  // on the overspin variant (others keep the peak at 0). Computed unconditionally
  // so FlipCard never calls a hook based on a runtime condition. Lives on the
  // non-3D wrapper in FlipCard, never on a `.tp-3d-layer`.
  const blur = useTransform(progress, [0, anim.landDeg / 2, anim.landDeg], [0, anim.shake ? 6 : 0, 0]);
  const filter = useTransform(blur, (v) => `blur(${v}px)`);

  // Overspin's "mask burn-through" dissolve: a transparent hole grows from the
  // centre and eats the panel outward, revealing the board beneath. `burn`
  // drives the hole radius (0 = solid, 1 = fully burned away). Always created so
  // the hooks are unconditional; only wired up for the overspin variant below.
  const burn = useMotionValue(0);
  const maskImage = useMotionTemplate`radial-gradient(circle at 50% 45%, transparent calc(${burn} * 160% - 20%), #000 calc(${burn} * 160%))`;

  const [landed, setLanded] = useState(false);
  const [dissolving, setDissolving] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const timers: number[] = [];
    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      onComplete();
    };

    if (reduce) {
      timers.push(window.setTimeout(() => setDissolving(true), 300));
      timers.push(window.setTimeout(finish, 300 + 350));
      return () => timers.forEach(window.clearTimeout);
    }

    const controls = animate(progress, anim.keyframes, {
      // Force a duration-based tween: framer defaults a 2-keyframe value
      // animation (the split-flap driver) to a SPRING, which ignores `duration`
      // and settles in ~0.3s — collapsing the staggered wave. `type: "tween"`
      // makes every variant honour its keyframes/times/ease/duration.
      type: "tween",
      duration: anim.durationMs / 1000,
      times: anim.times,
      ease: anim.ease,
      onComplete: () => {
        setLanded(true);
        timers.push(window.setTimeout(() => setDissolving(true), HOLD_MS));
        timers.push(window.setTimeout(finish, HOLD_MS + DISSOLVE_MS));
      },
    });

    return () => {
      controls.stop();
      timers.forEach(window.clearTimeout);
    };
    // One-shot on mount — every animation-triggered payload gets a fresh mount
    // of this component, so re-running on prop changes isn't needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Overspin dissolve = grow the burn-through hole while the panel clears.
  useEffect(() => {
    if (!dissolving || reduce || variant !== "overspin") return;
    const controls = animate(burn, 1, { duration: DISSOLVE_MS / 1000, ease: "easeIn" });
    return () => controls.stop();
  }, [dissolving, reduce, variant, burn]);

  // Per-variant "clear the announcement, reveal the board" handoff (Phase 3):
  //  · card      → bloom-out: swells and blooms into light as it fades.
  //  · splitFlap → column snap-shut: the panel snaps closed like a flap.
  //  · overspin  → mask burn-through: a hole burns outward from the centre
  //                (handled by `burn`/`maskImage`; opacity 0 is an iOS fallback
  //                if mask-image isn't honoured).
  const dissolveTarget = reduce
    ? { opacity: 0 }
    : variant === "card"
    ? { opacity: 0, scale: 1.12 }
    : variant === "splitFlap"
    ? { opacity: 0, scaleY: 0 }
    : { opacity: 0 };
  const dissolveEase: Easing = variant === "splitFlap" ? "easeIn" : "easeOut";
  const useBurnMask = variant === "overspin" && !reduce;

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden bg-slate-950"
      style={useBurnMask ? { maskImage, WebkitMaskImage: maskImage } : undefined}
      animate={
        dissolving
          ? dissolveTarget
          : anim.shake && landed
          ? { x: [0, 10, -7, 5, -2, 0], y: [0, -8, 4, -2, 1, 0], opacity: 1 }
          : { opacity: 1 }
      }
      transition={dissolving ? { duration: DISSOLVE_MS / 1000, ease: dissolveEase } : { duration: 0.4, ease: "easeOut" }}
      aria-hidden
    >
      {reduce ? (
        <Face side="reverse" />
      ) : variant === "splitFlap" ? (
        <SplitFlap progress={progress} />
      ) : (
        <FlipCard rotateY={progress} filter={filter} />
      )}

      {/* Sheen sweep — a single specular glint travelling across the card as it
          turns. Screen-space (2D) so it never touches the 3D context. Card only. */}
      {!reduce && variant === "card" && (
        <motion.div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_38%,rgba(255,255,255,0.28)_48%,transparent_58%)]"
          initial={{ x: "-120%" }}
          animate={{ x: "120%" }}
          transition={{ duration: 0.95, ease: "easeInOut", delay: 0.35 }}
        />
      )}

      {/* Landing flash — a quick bloom on impact, most noticeable on overspin. */}
      {landed && !reduce && (
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(60%_40%_at_50%_44%,rgba(255,248,225,0.9),rgba(255,197,61,0.3)_45%,transparent_72%)]"
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      )}

      {/* Card dissolve = bloom-out: a light bloom swells from the centre as the
          panel swells + fades, so the announcement clears into light. */}
      {dissolving && !reduce && variant === "card" && (
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(255,255,255,0.9),rgba(255,197,61,0.25)_40%,transparent_70%)]"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.8, 0], scale: 1.9 }}
          transition={{ duration: DISSOLVE_MS / 1000, ease: "easeOut" }}
        />
      )}
    </motion.div>
  );
};

export default CategoryBlitzModeFlipTakeover;
