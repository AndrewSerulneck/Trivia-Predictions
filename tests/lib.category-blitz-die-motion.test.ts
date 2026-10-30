import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIE_HOP_MS,
  DIE_LAND_MS,
  DIE_LANDING_TOTAL_MS,
  DIE_SETTLE_MS,
} from "@/lib/categoryBlitzLetterDie";
import {
  DIE_HOLD_TILE_PX,
  DIE_PERSPECTIVE_PX,
  DIE_SIZE_PX,
  FACE_COUNT,
  FACE_ORIENTATIONS,
  SETTLE_DURATIONS_MS,
  faceFrontOrientation,
  faceViews,
  landingFrame,
  mostHiddenFace,
  qMat,
  qMul,
  qSlerp,
  squash,
  tumbleHeightPx,
  tumbleImpacts,
  type Quat,
} from "@/lib/categoryBlitzDieMotion";

const IDENTITY: Quat = [1, 0, 0, 0];
const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("die faces", () => {
  it("each face's front orientation shows that face to the player, upright", () => {
    for (let i = 0; i < FACE_COUNT; i += 1) {
      const R = qMat(qMul(faceFrontOrientation(i), FACE_ORIENTATIONS[i]));
      // Face-local axes map onto screen axes: no tilt, no roll.
      for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) close(R[r][c], r === c ? 1 : 0, 1e-9);
      expect(faceViews(faceFrontOrientation(i))[i].z).toBeCloseTo(1, 9);
    }
  });

  it("the most hidden face at rest is the back face, and exactly one face points at the player", () => {
    expect(mostHiddenFace(IDENTITY)).toBe(1);
    const views = faceViews(IDENTITY);
    expect(views.filter((v) => v.z > 0.99)).toHaveLength(1);
    expect(views[1].hidden).toBe(true);
    expect(views[0].hidden).toBe(false);
    for (const v of views) {
      expect(v.shade).toBeGreaterThanOrEqual(0);
      expect(v.shade).toBeLessThanOrEqual(0.5);
    }
  });

  it("slerp ends exactly on the target", () => {
    const target = faceFrontOrientation(3);
    const out = qSlerp([0.5, 0.5, 0.5, 0.5], target, 1);
    out.forEach((v, i) => close(Math.abs(v), Math.abs(target[i]), 1e-9));
  });
});

describe("tumble bounce", () => {
  it("drops in from off the floor and hits the floor exactly every hop", () => {
    expect(tumbleHeightPx(0, DIE_SIZE_PX)).toBeGreaterThan(DIE_SIZE_PX * 2);
    for (let k = 1; k <= 8; k += 1) close(tumbleHeightPx(k * DIE_HOP_MS, DIE_SIZE_PX), 0, 1e-6);
    expect(tumbleHeightPx(DIE_HOP_MS * 1.5, DIE_SIZE_PX)).toBeCloseTo(0.55 * DIE_SIZE_PX, 6);
  });

  it("counts an impact at each floor hit (one light buzz each)", () => {
    expect(tumbleImpacts(DIE_HOP_MS - 1)).toBe(0);
    expect(tumbleImpacts(DIE_HOP_MS)).toBe(1);
    expect(tumbleImpacts(DIE_HOP_MS * 4 + 10)).toBe(4);
  });

  it("is continuous (no teleport) across every frame", () => {
    for (let t = 1; t < DIE_HOP_MS * 6; t += 1) {
      expect(Math.abs(tumbleHeightPx(t, DIE_SIZE_PX) - tumbleHeightPx(t - 1, DIE_SIZE_PX))).toBeLessThan(4);
    }
  });
});

describe("landing", () => {
  it("settle bounces fill the settle budget exactly, so the picture matches the stage clock", () => {
    close(SETTLE_DURATIONS_MS.reduce((a, b) => a + b, 0), DIE_SETTLE_MS, 1e-9);
    expect(DIE_LANDING_TOTAL_MS).toBe(DIE_LAND_MS + DIE_SETTLE_MS);
  });

  it("hops, lands on the floor, settles, and is still at the end", () => {
    expect(landingFrame(0, DIE_SIZE_PX).heightPx).toBe(0);
    expect(landingFrame(DIE_LAND_MS / 2, DIE_SIZE_PX).heightPx).toBeCloseTo(0.55 * 1.4 * DIE_SIZE_PX, 6);
    expect(landingFrame(DIE_LAND_MS, DIE_SIZE_PX)).toMatchObject({ heightPx: 0, hopProgress: 1, sinceImpactMs: 0 });
    expect(landingFrame(DIE_LANDING_TOTAL_MS, DIE_SIZE_PX).heightPx).toBeCloseTo(0, 9);
    for (let t = 1; t < DIE_LANDING_TOTAL_MS; t += 1) {
      expect(Math.abs(landingFrame(t, DIE_SIZE_PX).heightPx - landingFrame(t - 1, DIE_SIZE_PX).heightPx)).toBeLessThan(4);
    }
  });

  it("squashes only briefly after an impact", () => {
    expect(squash(null, 1)).toEqual([1, 1]);
    expect(squash(500, 1)).toEqual([1, 1]);
    const [sx, sy] = squash(85, 1);
    expect(sx).toBeGreaterThan(1);
    expect(sy).toBeLessThan(1);
  });
});

describe("LetterDieRoll's fixed px classes match the constants", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "components/category-blitz/LetterDieRoll.tsx"), "utf8");
  it("die size, perspective and the hold tile", () => {
    expect(DIE_SIZE_PX).toBe(168);
    expect(src).toContain("h-[168px] w-[168px]");
    expect(src).toContain(`[perspective:${DIE_PERSPECTIVE_PX}px]`);
    expect(Math.round(DIE_HOLD_TILE_PX)).toBe(196);
    expect(src).toContain("h-[196px] w-[196px]");
  });
  it("haptics only through triggerAnimation, no sound, no request", () => {
    expect(src).not.toMatch(/playHaptic|haptic\(|navigator\.vibrate|callNative/);
    expect(src).not.toMatch(/new Audio|\.mp3|\.wav|<audio/);
    expect(src).not.toMatch(/fetch\(|supabase/);
    expect(src).toContain('triggerAnimation("CATEGORY_BLITZ_DIE_BOUNCE")');
    expect(src).toContain('triggerAnimation("CATEGORY_BLITZ_DIE_LAND")');
  });
});
