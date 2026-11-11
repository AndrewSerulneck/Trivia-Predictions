import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CELEBRATION_EFFECT_ORDER,
  CELEBRATION_HERO_T,
  celebrationFootprint,
  planCelebration,
  type EffectRect,
} from "@/lib/socialShare/celebrationEffects";
import {
  CELEBRATION_VIDEO_FPS,
  CELEBRATION_VIDEO_FRAMES,
  CELEBRATION_VIDEO_HOLD_S,
  CELEBRATION_VIDEO_SECONDS,
} from "@/lib/socialShare/celebrationVideo";
import type { StoryShapeBlock, StorySharePayload } from "@/lib/socialShare/contracts";
import { SHARE_DESTINATION_COPY } from "@/lib/socialShare/copyPresets";
import { SHARE_DESTINATIONS, planShareDestination } from "@/lib/socialShare/shareDestinations";
import {
  buildShareDesignAnimation,
  buildShareDesignSpec,
  shareDesignCelebrationStage,
  type StoryShareDesign,
} from "@/lib/socialShare/shareDesigns";
import { STORY_SHARE_GAME_TYPES } from "@/lib/socialShare/shareGames";
import { buildPrizeStorySharePayload, buildStorySharePayload, prepareStorySharePayload } from "@/lib/socialShare/storyPayloads";

// docs/share-win-celebration-plan.md Phase 2: the animated Story (a silent 5 s MP4 made on the phone).

const DESIGNS: StoryShareDesign[] = ["spotlight", "card", "night", "selfie"];
const ALL = [...CELEBRATION_EFFECT_ORDER];
const ADDRESS = { street: "1010 Pacific St", locality: "Brooklyn, NY" };

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

const PAYLOADS: StorySharePayload[] = [
  ...STORY_SHARE_GAME_TYPES.map((gameType) => gamePayload({ gameType })),
  {
    ...buildPrizeStorySharePayload({
      venueId: "v1",
      venueName: "The Pour House",
      venueAddress: ADDRESS,
      userId: "u1",
      username: "ace",
      prize: { headline: "$15", headlineKind: "amount", label: "GIFT CARD" },
    }),
    venueInstagram: "thepourhouse",
  },
];

/** Every frame time that moves (the held frames are the hero moment). */
const MOVING_FRAMES = Array.from({ length: Math.round(CELEBRATION_HERO_T * CELEBRATION_VIDEO_FPS) }, (_, i) => i / CELEBRATION_VIDEO_FPS);

/** The absolute points a path moves or draws a line to (M/L): corners of strips, rays, capsules. */
const pathPoints = (path: string): Array<{ x: number; y: number }> =>
  [...path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }));

const inside = (point: { x: number; y: number }, rect: EffectRect): boolean =>
  point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height;

describe("the video's timing", () => {
  it("is 5 s at 30 fps, and holds the still picture for the last 1.5 s", () => {
    expect(CELEBRATION_VIDEO_SECONDS).toBe(5);
    expect(CELEBRATION_VIDEO_FRAMES).toBe(150);
    expect(CELEBRATION_VIDEO_HOLD_S).toBe(1.5);
  });

  it("the animated picture is the still picture without effects; from the hero moment on its effects ARE the still's", () => {
    for (const design of DESIGNS) {
      const prepared = prepareStorySharePayload(gamePayload());
      const still = buildShareDesignSpec(prepared, design, "story", { effects: ALL });
      const animation = buildShareDesignAnimation(prepared, design, "story", { effects: ALL });
      expect(animation.spec).toEqual({ ...still, effects: null });
      for (const t of [CELEBRATION_HERO_T, 4, 4.9667, CELEBRATION_VIDEO_SECONDS]) {
        expect(animation.effectsAt(t), `${design} @ ${t}`).toEqual(still.effects);
      }
    }
  });

  it("the first frame is the plain picture with the hands only (nothing has launched, faded in or fallen yet)", () => {
    const animation = buildShareDesignAnimation(prepareStorySharePayload(gamePayload()), "spotlight", "story", { effects: ALL });
    const first = animation.effectsAt(0);
    expect(first.behind).toEqual([]);
    expect(first.middle.filter((block) => block.fill?.kind !== "solid" || block.opacity !== 0.95)).toEqual([]);
    expect(first.front.length).toBeGreaterThan(0);
  });

  it("every effect moves before the hero moment", () => {
    const animation = buildShareDesignAnimation(prepareStorySharePayload(gamePayload()), "night", "story", { effects: ALL });
    const hero = animation.effectsAt(CELEBRATION_HERO_T);
    const earlier = animation.effectsAt(2);
    expect(earlier.behind).not.toEqual(hero.behind);
    expect(earlier.middle).not.toEqual(hero.middle);
    expect(earlier.front).not.toEqual(hero.front);
  });
});

describe("moving effects stay off the content (every moving frame)", () => {
  it("confetti still falling never lands on a word, the QR, the panel or a face", () => {
    const hits: string[] = [];
    for (const payload of PAYLOADS) {
      const prepared = prepareStorySharePayload(payload);
      for (const design of DESIGNS) {
        const stage = shareDesignCelebrationStage(prepared, design, "story");
        const animation = buildShareDesignAnimation(prepared, design, "story", { effects: ["confetti"] });
        for (const t of MOVING_FRAMES) {
          for (const block of animation.effectsAt(t).middle) {
            for (const point of pathPoints(block.path ?? "")) {
              if (stage.keepOut.some((rect) => inside(point, rect))) hits.push(`${payload.gameType} ${design} @ ${t.toFixed(2)}s`);
            }
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it("a firework rises and opens inside its own space", () => {
    const strays: string[] = [];
    for (const payload of PAYLOADS) {
      const prepared = prepareStorySharePayload(payload);
      for (const design of DESIGNS) {
        const plan = planCelebration(shareDesignCelebrationStage(prepared, design, "story"));
        const circles = celebrationFootprint(plan).fireworks;
        const animation = buildShareDesignAnimation(prepared, design, "story", { effects: ["fireworks"] });
        for (const t of MOVING_FRAMES) {
          for (const block of animation.effectsAt(t).middle) {
            for (const point of pathPoints(block.path ?? "")) {
              const home = circles.some((circle) => Math.hypot(point.x - circle.cx, point.y - circle.cy) <= circle.r + 1);
              if (!home) strays.push(`${payload.gameType} ${design} @ ${t.toFixed(2)}s`);
            }
          }
        }
      }
    }
    expect(strays).toEqual([]);
  });

  it("over a selfie, a swaying laser has faded out before the face", () => {
    const hits: string[] = [];
    for (const payload of PAYLOADS) {
      const prepared = prepareStorySharePayload(payload);
      const face = shareDesignCelebrationStage(prepared, "selfie", "story").face!;
      const animation = buildShareDesignAnimation(prepared, "selfie", "story", { effects: ["lasers"] });
      for (const t of MOVING_FRAMES) {
        const beams = animation.effectsAt(t).behind.filter((block: StoryShapeBlock) => block.transform);
        for (const beam of beams) {
          const length = Math.max(...pathPoints(beam.path ?? "").map((point) => point.x));
          const { x, y, rotate = 0 } = beam.transform!;
          // The light is gone 80% of the way along (LASER_VISIBLE).
          for (let along = 0; along <= length * 0.8; along += 8) {
            const point = { x: x + Math.cos(rotate) * along, y: y + Math.sin(rotate) * along };
            if (inside(point, face)) hits.push(`${payload.gameType} @ ${t.toFixed(2)}s`);
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("sharing the video", () => {
  it("never takes the app's picture-only Instagram Story shortcut (Phase 3, later): the share sheet does", () => {
    const plan = planShareDestination("instagram-story", { instagramStoryDirect: true, canSharePicture: true, inApp: true, video: true });
    expect(plan.action).toBe("share-sheet");
    expect(planShareDestination("instagram-story", { instagramStoryDirect: true, canSharePicture: true, inApp: true }).action).toBe(
      "instagram-story-native"
    );
  });

  it("hints say video, never picture; Save still downloads on the website", () => {
    for (const destination of SHARE_DESTINATIONS) {
      for (const inApp of [false, true]) {
        for (const canSharePicture of [false, true]) {
          const plan = planShareDestination(destination, { instagramStoryDirect: false, canSharePicture, inApp, video: true });
          expect(plan.hint, destination).not.toMatch(/picture|image/i);
        }
      }
    }
    expect(planShareDestination("save", { instagramStoryDirect: false, canSharePicture: true, inApp: false, video: true })).toEqual({
      copyCaption: false,
      action: "download",
      hint: "Video saved.",
    });
    // A picture keeps its own words.
    expect(planShareDestination("save", { instagramStoryDirect: false, canSharePicture: true, inApp: false }).hint).toBe(SHARE_DESTINATION_COPY.save.direct);
  });
});

describe("cost and size rules", () => {
  const source = readFileSync(join(process.cwd(), "lib/socialShare/celebrationVideo.ts"), "utf8");

  it("loads the video library only when a video is made, and adds no sound and no request", () => {
    expect(source).not.toMatch(/^import[^;]*["']mediabunny["']/m);
    expect(source).toMatch(/await|import\("mediabunny"\)/);
    expect(source).not.toMatch(/fetch\(|AudioBufferSource|addAudioTrack/);
  });

  it("is MP4 only, never WebM", () => {
    expect(source).toMatch(/Mp4OutputFormat/);
    expect(source).not.toMatch(/WebM\w*Format|["']video\/webm|["']webm["']/i);
  });
});
