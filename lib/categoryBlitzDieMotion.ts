/**
 * Category Blitz letter die — pure 3D + bounce maths for LetterDieRoll
 * (docs/category-blitz-letter-die-plan.md, Phase 3). No React, no DOM.
 * Ported from the Phase 1 prototype (docs/prototypes/category-blitz-letter-die.html).
 *
 * Axes are CSS's: x right, y down, z toward the viewer. Quaternions are [w, x, y, z].
 * Heights are pixels above the floor; times are ms. Stage timings come from
 * lib/categoryBlitzLetterDie.ts so the picture and the stage clock can never disagree.
 */

import {
  DIE_HOP_MS,
  DIE_LAND_MS,
  DIE_SETTLE_BOUNCES,
  DIE_SETTLE_MS,
} from "@/lib/categoryBlitzLetterDie";

export type Quat = readonly [number, number, number, number];
export type Vec3 = readonly [number, number, number];
type Mat3 = readonly [Vec3, Vec3, Vec3];

/** Die edge in CSS px (prototype default, plan §2 item 6). */
export const DIE_SIZE_PX = 168;
/** Waiting-bounce height as a fraction of the die. */
export const DIE_HOP_HEIGHT = 0.55;
/** Landing hop height as a multiple of the waiting bounce. */
export const DIE_LAND_HEIGHT = 1.4;
/** Tumble spin speed. */
export const DIE_SPIN_DEG_PER_S = 620;
/** Filler letters swap on faces turned away from the player this often. */
export const DIE_LETTER_SWAP_MS = 110;
/** The held letter grows to this scale over DIE_HOLD_GROW_MS (DIE_HOLD_TILE_PX assumes it). */
export const DIE_HOLD_SCALE = 1.06;
export const DIE_HOLD_GROW_MS = 220;
/** CSS perspective on the die's anchor (its vanishing point is the die's resting centre). */
export const DIE_PERSPECTIVE_PX = 900;
/**
 * At hold, the front face (pushed half an edge toward the viewer) looks this
 * much bigger than the die's edge. The flat letter tile that flies into the
 * badge is drawn at this size so it covers the face exactly
 * (LetterDieRoll's `h-[196px] w-[196px]` tile; a test pins the number).
 */
export const DIE_HOLD_TILE_PX =
  (DIE_SIZE_PX * DIE_HOLD_SCALE * DIE_PERSPECTIVE_PX) / (DIE_PERSPECTIVE_PX - DIE_SIZE_PX / 2);
/** The rotation reaches the letter face at this fraction of the landing hop. */
export const DIE_LAND_ALIGN_AT = 0.88;
/** Majority Rules: faces turn magenta/gold from this fraction of the landing hop (plan §2 item 9). */
export const DIE_MR_TINT_AT = 0.35;
/** Squash on impact. */
export const DIE_SQUASH_MS = 170;
/** A face counts as "turned away" (safe to swap its letter) below this z. */
const HIDDEN_FACE_Z = -0.15;
/** Each settle bounce is this fraction of the previous height. */
const SETTLE_RATIO = 0.18;

export const qMul = (a: Quat, b: Quat): Quat => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];

export const qAxis = (axis: Vec3, angle: number): Quat => {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const s = Math.sin(angle / 2);
  return [Math.cos(angle / 2), (axis[0] / l) * s, (axis[1] / l) * s, (axis[2] / l) * s];
};

export const qNorm = (q: Quat): Quat => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};

export const qConj = (q: Quat): Quat => [q[0], -q[1], -q[2], -q[3]];

export const qSlerp = (a: Quat, bIn: Quat, t: number): Quat => {
  let b = bIn;
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) {
    b = [-b[0], -b[1], -b[2], -b[3]];
    d = -d;
  }
  if (d > 0.9995) {
    return qNorm([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb, a[3] * wa + b[3] * wb];
};

export const qMat = ([w, x, y, z]: Quat): Mat3 => [
  [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
  [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
  [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
];

const rotate = (R: Mat3, n: Vec3): Vec3 => [
  R[0][0] * n[0] + R[0][1] * n[1] + R[0][2] * n[2],
  R[1][0] * n[0] + R[1][1] * n[1] + R[1][2] * n[2],
  R[2][0] * n[0] + R[2][1] * n[1] + R[2][2] * n[2],
];

/** CSS `matrix3d(...)` for a rotation (column-major). */
export const cssRotation = (q: Quat): string => {
  const R = qMat(q);
  return `matrix3d(${R[0][0]},${R[1][0]},${R[2][0]},0,${R[0][1]},${R[1][1]},${R[2][1]},0,${R[0][2]},${R[1][2]},${R[2][2]},0,0,0,0,1)`;
};

const HALF_TURN = Math.PI / 2;
/** Each face's orientation on the cube: front, back, right, left, bottom, top. */
export const FACE_ORIENTATIONS: readonly Quat[] = [
  qAxis([0, 1, 0], 0),
  qAxis([0, 1, 0], Math.PI),
  qAxis([0, 1, 0], HALF_TURN),
  qAxis([0, 1, 0], -HALF_TURN),
  qAxis([1, 0, 0], HALF_TURN),
  qAxis([1, 0, 0], -HALF_TURN),
];
export const FACE_COUNT = FACE_ORIENTATIONS.length;
const FACE_NORMALS: readonly Vec3[] = FACE_ORIENTATIONS.map((q) => rotate(qMat(q), [0, 0, 1]));
/** Upper-left, toward the viewer. */
const LIGHT: Vec3 = (() => {
  const v: Vec3 = [-0.35, -0.65, 0.68];
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/** The cube orientation that shows `face` to the player, upright. */
export const faceFrontOrientation = (face: number): Quat => qConj(FACE_ORIENTATIONS[face]);

export interface FaceView {
  /** Turned away from the player: its letter may be swapped unseen. */
  hidden: boolean;
  /** 0–0.5 darkness overlay from the fixed light. */
  shade: number;
  /** z of the face normal toward the viewer (−1 = facing straight away). */
  z: number;
}

export const faceViews = (q: Quat): FaceView[] => {
  const R = qMat(q);
  return FACE_NORMALS.map((n0) => {
    const n = rotate(R, n0);
    const lit = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    return { hidden: n[2] < HIDDEN_FACE_Z, shade: 0.5 * (1 - lit), z: n[2] };
  });
};

/** The face pointing most directly away from the player — the real letter is written there, unseen. */
export const mostHiddenFace = (q: Quat): number => {
  const views = faceViews(q);
  let best = 0;
  for (let i = 1; i < views.length; i += 1) if (views[i].z < views[best].z) best = i;
  return best;
};

/** Advance the spin by `dtMs` around `axis`. */
export const spinStep = (q: Quat, axis: Vec3, dtMs: number, speedMul = 1): Quat =>
  qNorm(qMul(qAxis(axis, ((DIE_SPIN_DEG_PER_S * Math.PI) / 180) * (dtMs / 1000) * speedMul), q));

/** Nudge the spin axis at a bounce so the tumble never looks like a loop. */
export const kickAxis = (axis: Vec3, rng: () => number): Vec3 => {
  const a: Vec3 = [axis[0] + (rng() - 0.5) * 1.1, axis[1] + (rng() - 0.5) * 1.1, axis[2] + (rng() - 0.5) * 1.1];
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const easeInOutCubic = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

const hopPx = (sizePx: number): number => DIE_HOP_HEIGHT * sizePx;

/**
 * Height during the tumble, as a function of time since the tumble began.
 * The first hop is the drop in from above (same gravity), so impacts land
 * exactly on k·DIE_HOP_MS (k ≥ 1) — the instants `landingStartMs` picks.
 */
export const tumbleHeightPx = (elapsedMs: number, sizePx: number): number => {
  const h = hopPx(sizePx);
  if (elapsedMs < DIE_HOP_MS) {
    const u = Math.max(0, elapsedMs) / DIE_HOP_MS;
    return 4 * h * (1 - u * u);
  }
  const u = ((elapsedMs - DIE_HOP_MS) % DIE_HOP_MS) / DIE_HOP_MS;
  return 4 * h * u * (1 - u);
};

/** Floor impacts so far in the tumble (each is a light buzz). */
export const tumbleImpacts = (elapsedMs: number): number => Math.max(0, Math.floor(elapsedMs / DIE_HOP_MS));

const SETTLE_RATIOS: readonly number[] = Array.from({ length: DIE_SETTLE_BOUNCES }, (_, i) => Math.pow(SETTLE_RATIO, i + 1));
const SETTLE_WEIGHT = SETTLE_RATIOS.reduce((sum, r) => sum + Math.sqrt(r), 0);
/** Settle bounce durations ∝ √height (real bounces), scaled to fill DIE_SETTLE_MS exactly. */
export const SETTLE_DURATIONS_MS: readonly number[] = SETTLE_RATIOS.map((r) => (DIE_SETTLE_MS * Math.sqrt(r)) / SETTLE_WEIGHT);

export interface LandingFrame {
  heightPx: number;
  /** 0→1 through the landing hop (1 once settling). */
  hopProgress: number;
  /** ms since the most recent impact inside the landing (null before the landing impact). */
  sinceImpactMs: number | null;
  /** Strength of that impact, for the squash. */
  impactStrength: number;
}

/** Height through the landing stage: the hop, then the settle bounces. */
export const landingFrame = (elapsedMs: number, sizePx: number): LandingFrame => {
  const hL = hopPx(sizePx) * DIE_LAND_HEIGHT;
  if (elapsedMs < DIE_LAND_MS) {
    const u = Math.max(0, elapsedMs) / DIE_LAND_MS;
    return { heightPx: 4 * hL * u * (1 - u), hopProgress: u, sinceImpactMs: null, impactStrength: 0 };
  }
  let t = elapsedMs - DIE_LAND_MS;
  let impactStrength = 1.25;
  for (let i = 0; i < SETTLE_DURATIONS_MS.length; i += 1) {
    const d = SETTLE_DURATIONS_MS[i];
    if (t < d) {
      const u = t / d;
      return { heightPx: 4 * hL * SETTLE_RATIOS[i] * u * (1 - u), hopProgress: 1, sinceImpactMs: t, impactStrength };
    }
    t -= d;
    impactStrength = 0.35 * Math.sqrt(SETTLE_RATIOS[i] / SETTLE_RATIO);
  }
  return { heightPx: 0, hopProgress: 1, sinceImpactMs: t, impactStrength };
};

/** [scaleX, scaleY] squash `sinceImpactMs` after an impact of `strength`. */
export const squash = (sinceImpactMs: number | null, strength: number): [number, number] => {
  if (sinceImpactMs === null || sinceImpactMs < 0 || sinceImpactMs >= DIE_SQUASH_MS) return [1, 1];
  const k = strength * Math.sin((Math.PI * sinceImpactMs) / DIE_SQUASH_MS);
  return [1 + 0.11 * k, 1 - 0.16 * k];
};
