import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CELEBRATION_EFFECT_ORDER,
  CELEBRATION_HERO_T,
  celebrationEffectsKey,
  celebrationFootprint,
  celebrationLayers,
  normalizeCelebrationEffects,
  planCelebration,
  type CelebrationEffect,
  type EffectRect,
} from "@/lib/socialShare/celebrationEffects";
import type { StorySharePayload } from "@/lib/socialShare/contracts";
import { SHARE_EFFECT_NAMES, SHARE_PLAY_LINE } from "@/lib/socialShare/copyPresets";
import {
  buildShareDesignSpec,
  shareDesignCelebrationStage,
  STORY_SHARE_SIZE_ORDER,
  STORY_SHARE_SIZES,
  type StoryShareDesign,
} from "@/lib/socialShare/shareDesigns";
import { STORY_SHARE_GAME_TYPES } from "@/lib/socialShare/shareGames";
import { buildPrizeStorySharePayload, buildStorySharePayload, prepareStorySharePayload } from "@/lib/socialShare/storyPayloads";

// docs/share-win-celebration-plan.md Phase 1: Fireworks, Lasers, Confetti and Clapping hands, chosen by the guest.

const DESIGNS: StoryShareDesign[] = ["spotlight", "card", "night", "selfie"];
const ADDRESS = { street: "1010 Pacific St", locality: "Brooklyn, NY" };
const LONG_BAR = "Seven Sirens Brewing Company of the Greater Lehigh Valley";

const gamePayload = (overrides: Partial<StorySharePayload> = {}): StorySharePayload => ({
  ...buildStorySharePayload("live-trivia", {
    venueId: "v1",
    venueName: "The Pour House",
    venueAddress: ADDRESS,
    userId: "u1",
    username: "ace",
    finalRank: 1,
    finalPoints: 120,
    correctRate: 80,
  }),
  ...overrides,
});

const prizePayload = (prize: NonNullable<StorySharePayload["prize"]>, venueName: string | null = "The Pour House") =>
  buildPrizeStorySharePayload({ venueId: "v1", venueName, venueAddress: ADDRESS, userId: "u1", username: "ace", prize });

/** Every game, plus the tallest panels and the longest lines the pictures are drawn for. */
const PAYLOADS: StorySharePayload[] = [
  ...STORY_SHARE_GAME_TYPES.map((gameType) => gamePayload({ gameType })),
  gamePayload({ isChampion: false, finalRank: 4, venueAddress: null }),
  gamePayload({ venueName: LONG_BAR, venueInstagram: "sevensirensbrewingcompany_lv" }),
  { ...prizePayload({ headline: "$15", headlineKind: "amount", label: "GIFT CARD" }), venueInstagram: "thepourhouse" },
  prizePayload({ headline: "50% Off Appetizer", headlineKind: "phrase", label: "PRIZE" }, LONG_BAR),
  gamePayload({ venueName: null, venueAddress: null }),
];

/** All 16 combinations of the four effects. */
const COMBINATIONS: CelebrationEffect[][] = Array.from({ length: 16 }, (_, mask) =>
  CELEBRATION_EFFECT_ORDER.filter((_, bit) => (mask >> bit) & 1));

const everyPicture = () =>
  PAYLOADS.flatMap((payload) =>
    STORY_SHARE_SIZE_ORDER.flatMap((size) => {
      const prepared = prepareStorySharePayload(payload, { size });
      return DESIGNS.map((design) => ({ payload, size, design, prepared }));
    })
  );

const overlaps = (a: EffectRect, b: EffectRect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const circleOverlaps = (c: { cx: number; cy: number; r: number }, rect: EffectRect): boolean => {
  const x = Math.max(rect.x, Math.min(c.cx, rect.x + rect.width));
  const y = Math.max(rect.y, Math.min(c.cy, rect.y + rect.height));
  return (c.cx - x) ** 2 + (c.cy - y) ** 2 < c.r * c.r;
};

describe("the guest's choice", () => {
  it("chip labels only, in chip order", () => {
    expect(CELEBRATION_EFFECT_ORDER).toEqual(["fireworks", "lasers", "confetti", "clapping"]);
    expect(SHARE_EFFECT_NAMES).toEqual({ fireworks: "Fireworks", lasers: "Lasers", confetti: "Confetti", clapping: "Clapping" });
  });

  it("is cleaned: known effects, no repeats, chip order", () => {
    expect(normalizeCelebrationEffects(["clapping", "nope", "fireworks", "clapping"])).toEqual(["fireworks", "clapping"]);
    expect(celebrationEffectsKey(["lasers", "fireworks"])).toBe("fireworks+lasers");
    expect(celebrationEffectsKey([])).toBe("");
  });

  it("no effects = today's picture exactly", () => {
    const prepared = prepareStorySharePayload(gamePayload());
    const plain = buildShareDesignSpec(prepared, "spotlight", "story");
    expect(plain.effects).toBeNull();
    expect(buildShareDesignSpec(prepared, "spotlight", "story", { effects: [] })).toEqual(plain);
  });
});

describe("every combination on every design and size", () => {
  it("draws exactly the chosen effects, each in its layer, and never touches the words, logo or QR", () => {
    for (const { prepared, design, size } of everyPicture()) {
      const plain = buildShareDesignSpec(prepared, design, size);
      for (const effects of COMBINATIONS) {
        const label = `${prepared.payload.gameType} ${design} ${size} [${effects.join("+")}]`;
        const spec = buildShareDesignSpec(prepared, design, size, { effects });
        expect(spec.textBlocks, label).toEqual(plain.textBlocks);
        expect(spec.images, label).toEqual(plain.images);
        expect(spec.shapes, label).toEqual(plain.shapes);
        if (effects.length === 0) {
          expect(spec.effects, label).toBeNull();
          continue;
        }
        const layers = spec.effects!;
        expect(layers.behind.length > 0, `${label} lasers`).toBe(effects.includes("lasers"));
        expect(layers.front.length > 0, `${label} clapping`).toBe(effects.includes("clapping"));
        expect(layers.middle.length > 0, `${label} fireworks/confetti`).toBe(effects.includes("fireworks") || effects.includes("confetti"));
      }
    }
  });

  it("every effect finds room on every picture", () => {
    for (const { prepared, design, size } of everyPicture()) {
      const label = `${prepared.payload.gameType} ${design} ${size}`;
      const plan = planCelebration(shareDesignCelebrationStage(prepared, design, size));
      expect(plan.bursts.length, `${label} bursts`).toBeGreaterThanOrEqual(1);
      expect(plan.claps.length, `${label} hands`).toBeGreaterThanOrEqual(1);
      expect(plan.pieces.length, `${label} confetti`).toBeGreaterThanOrEqual(20);
      expect(plan.beams.length, `${label} lasers`).toBeGreaterThanOrEqual(4);
    }
  });

  it("fireworks, confetti and hands stay off the content (and the selfie's face)", () => {
    for (const { prepared, design, size } of everyPicture()) {
      const label = `${prepared.payload.gameType} ${design} ${size}`;
      const stage = shareDesignCelebrationStage(prepared, design, size);
      if (design === "selfie") expect(stage.keepOut, label).toContainEqual(stage.face);
      const footprint = celebrationFootprint(planCelebration(stage));
      for (const rect of stage.keepOut) {
        for (const burst of footprint.fireworks) expect(circleOverlaps(burst, rect), `${label} burst`).toBe(false);
        for (const piece of footprint.confetti) expect(overlaps(piece, rect), `${label} confetti`).toBe(false);
        for (const hands of footprint.clapping) expect(overlaps(hands, rect), `${label} hands`).toBe(false);
      }
      // A Post selfie is mostly face: there, and only there, a burst may sit behind the hands (last resort).
      const tight = design === "selfie" && size === "post";
      for (const hands of footprint.clapping) {
        if (!tight) for (const burst of footprint.fireworks) expect(circleOverlaps(burst, hands), `${label} hands on a burst`).toBe(false);
        // Inside the picture.
        expect(hands.x, label).toBeGreaterThanOrEqual(0);
        expect(hands.x + hands.width, label).toBeLessThanOrEqual(STORY_SHARE_SIZES[size].width);
        expect(hands.y, label).toBeGreaterThanOrEqual(0);
        expect(hands.y + hands.height, label).toBeLessThanOrEqual(STORY_SHARE_SIZES[size].height);
      }
    }
  });

  it("the content boxes cover the headline and the venue panel", () => {
    const prepared = prepareStorySharePayload(gamePayload());
    for (const design of DESIGNS) {
      const stage = shareDesignCelebrationStage(prepared, design, "story");
      const spec = buildShareDesignSpec(prepared, design, "story");
      const panel = spec.textBlocks.find((block) => block.text === SHARE_PLAY_LINE)!;
      expect(stage.keepOut.some((rect) => rect.x <= panel.x && rect.y <= panel.y && rect.y + rect.height >= panel.y), design).toBe(true);
      const headline = spec.textBlocks.find((block) => block.text === prepared.winLine)!;
      const headlineY = headline.centerY ?? headline.y;
      expect(stage.keepOut.some((rect) => rect.y <= headlineY && rect.y + rect.height >= headlineY && rect.x <= 120), design).toBe(true);
    }
  });

  it("over a selfie, the bright part of a laser never crosses the face", () => {
    for (const { prepared, size } of everyPicture().filter(({ design }) => design === "selfie")) {
      const stage = shareDesignCelebrationStage(prepared, "selfie", size);
      const face = stage.face!;
      for (const beam of planCelebration(stage).beams) {
        for (let along = 0; along <= beam.length * 0.7; along += 12) {
          const x = beam.ox + Math.cos(beam.angle) * along;
          const y = beam.oy + Math.sin(beam.angle) * along;
          expect(x > face.x && x < face.x + face.width && y > face.y && y < face.y + face.height).toBe(false);
        }
      }
    }
  });
});

describe("stable pictures", () => {
  it("the same win always gets the same picture", () => {
    const a = buildShareDesignSpec(prepareStorySharePayload(gamePayload()), "night", "story", { effects: [...CELEBRATION_EFFECT_ORDER] });
    const b = buildShareDesignSpec(prepareStorySharePayload(gamePayload()), "night", "story", { effects: [...CELEBRATION_EFFECT_ORDER] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("switching one effect on never moves another", () => {
    const prepared = prepareStorySharePayload(gamePayload());
    for (const design of DESIGNS) {
      const all = buildShareDesignSpec(prepared, design, "story", { effects: [...CELEBRATION_EFFECT_ORDER] }).effects!;
      expect(buildShareDesignSpec(prepared, design, "story", { effects: ["clapping"] }).effects!.front).toEqual(all.front);
      expect(buildShareDesignSpec(prepared, design, "story", { effects: ["lasers"] }).effects!.behind).toEqual(all.behind);
      const fireworks = buildShareDesignSpec(prepared, design, "story", { effects: ["fireworks"] }).effects!.middle;
      const confetti = buildShareDesignSpec(prepared, design, "story", { effects: ["confetti"] }).effects!.middle;
      expect(all.middle).toEqual([...confetti, ...fireworks]);
    }
  });

  it("the still picture is the hero moment", () => {
    const stage = shareDesignCelebrationStage(prepareStorySharePayload(gamePayload()), "spotlight", "story");
    const plan = planCelebration(stage);
    expect(celebrationLayers(plan, [...CELEBRATION_EFFECT_ORDER])).toEqual(celebrationLayers(plan, [...CELEBRATION_EFFECT_ORDER], CELEBRATION_HERO_T));
    // Before the effects start there is nothing to see yet (Phase 2's first frame).
    const start = celebrationLayers(plan, ["fireworks", "lasers"], 0);
    expect(start.behind).toEqual([]);
    expect(start.middle).toEqual([]);
  });
});

describe("drawn art, not an emoji or a logo", () => {
  it("the effects draw paths only: no text, no images, no emoji", () => {
    const source = readFileSync(join(process.cwd(), "lib/socialShare/celebrationEffects.ts"), "utf8");
    expect(source).not.toMatch(/\p{Extended_Pictographic}/u);
    const prepared = prepareStorySharePayload(gamePayload());
    const layers = buildShareDesignSpec(prepared, "card", "story", { effects: [...CELEBRATION_EFFECT_ORDER] }).effects!;
    for (const block of [...layers.behind, ...layers.middle, ...layers.front]) {
      expect(block.path, "every effect block is vector art").toBeTruthy();
      expect(Object.keys(block)).not.toContain("text");
      expect(Object.keys(block)).not.toContain("src");
    }
  });
});
