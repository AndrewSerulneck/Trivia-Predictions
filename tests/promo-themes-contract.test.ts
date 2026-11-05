import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPromoEndCardLayout, PROMO_FORMATS, type MeasureText, type PromoEndCardInput } from "@/lib/promo/promoEndCard";
import { easeOut, REEL_FPS, REEL_SETTLE_S, reelHoldStartS, reelPlan, type ReelPlan } from "@/lib/promo/promoReel";
import { PROMO_TEMPLATES, type PromoTemplate } from "@/lib/promo/promoTemplates";
import { PROMO_THEMES } from "@/lib/promo/promoThemes";
import type { ThemeStage } from "@/lib/promo/promoThemeTypes";
import { STORY_SHARE_SIZES, STORY_TEXT_FLOOR_PX } from "@/lib/socialShare/shareDesigns";

// Game-themed Share to social pictures (docs/game-themes-plan.md Phase 2, Standing rules): every design
// has its game's theme; a theme styles the name, never rewords it; the stack stays inside Instagram's
// safe zone at or above the text floor for every game, size and prize count; artwork is vector only
// (no images, so no logos and no font trap).

// ~0.55em per character: close enough to Nunito to exercise wrapping and fitting.
const measure: MeasureText = (text, font) => text.length * Number(font.match(/(\d+)px/)?.[1] ?? 40) * 0.55;
const px = (font: string) => Number(font.match(/(\d+)px/)?.[1]);

const ONE = [{ headline: "$50 gift card", howToWin: "Finish at the top of the game this week" }];
const FOUR = ["$50 gift card", "Free appetizer", "20% off your whole order", "$10 gift card"].map((headline) => ({
  headline,
  howToWin: "Finish at the top of the game this week · Top 3 win",
}));

const input = (template: PromoTemplate, overrides: Partial<PromoEndCardInput> = {}): PromoEndCardInput => ({
  format: "post",
  template,
  when: { days: "Every Monday & Thursday", time: "8:30 PM" },
  venueName: "The Very Long Named Pour House & Kitchen",
  venueAddress: "1010 Pacific St · Brooklyn, NY",
  instagramHandle: "thepourhouse",
  prizes: ONE,
  measure,
  ...overrides,
});

const cases = PROMO_TEMPLATES.flatMap((template) =>
  PROMO_FORMATS.flatMap((format) => [[], ONE, FOUR].map((prizes) => ({ template, format, prizes }))),
);

describe("Share to social game themes", () => {
  it("every design has exactly its game's theme", () => {
    expect(Object.keys(PROMO_THEMES).sort()).toEqual(PROMO_TEMPLATES.map((template) => template.game).sort());
  });

  it.each(cases)("$template.game $format with $prizes.length prizes: inside the safe zone, at or above the floor", ({ template, format, prizes }) => {
    const { spec, groups } = buildPromoEndCardLayout(input(template, { format, prizes }));
    const size = STORY_SHARE_SIZES[format];
    for (const block of spec.textBlocks) {
      expect(block.centerY ?? block.y).toBeGreaterThanOrEqual(size.safeTop);
      expect(block.centerY ?? block.y).toBeLessThanOrEqual(size.height - size.safeBottom);
      expect(px(block.font)).toBeGreaterThanOrEqual(STORY_TEXT_FLOOR_PX);
    }
    // Backdrop decoration may run outside the safe zone, but no glyph is under the floor either.
    for (const block of spec.backdrop?.textBlocks ?? []) expect(px(block.font)).toBeGreaterThanOrEqual(STORY_TEXT_FLOOR_PX);
    // The rows fit and never overlap.
    const rows = groups.filter((group) => group.id !== "follow");
    for (let i = 1; i < rows.length; i += 1) expect(rows[i].top).toBeGreaterThanOrEqual(rows[i - 1].top + rows[i - 1].height);
    expect(rows[0].top).toBeGreaterThanOrEqual(size.safeTop);
    const follow = groups.find((group) => group.id === "follow");
    expect(follow!.top).toBeGreaterThanOrEqual(rows[rows.length - 1].top + rows[rows.length - 1].height);
    expect(follow!.top + follow!.height).toBeLessThanOrEqual(size.height - size.safeBottom);
    // Vector artwork only: no images (no logos, no QR, D19 / G6).
    expect(spec.images ?? []).toEqual([]);
  });

  it("a theme styles the name, never rewords it: the title row draws the template's words", () => {
    for (const template of PROMO_TEMPLATES) {
      const title = buildPromoEndCardLayout(input(template)).groups.find((group) => group.id === "title");
      const drawn = title!.text.map((block) => block.text).join("");
      for (const word of template.titleLines) expect(drawn.replace(/\s+/g, "")).toContain(word.replace(/\s+/g, ""));
    }
  });

  it("every theme's prize panel says WIN, the prize and how to win", () => {
    for (const template of PROMO_TEMPLATES) {
      const prize = buildPromoEndCardLayout(input(template)).groups.find((group) => group.id === "prize");
      expect(prize?.text.map((block) => block.text)).toEqual(expect.arrayContaining(["WIN", ONE[0].headline, ONE[0].howToWin]));
    }
  });

  it("Category Blitz (no prizes) shows its sample round card; Squares always shows its board", () => {
    const blitz = buildPromoEndCardLayout(input(PROMO_TEMPLATES.find((t) => t.game === "category_blitz")!, { prizes: [] }));
    expect(blitz.groups.find((group) => group.id === "art")?.text.map((block) => block.text)).toContain("3:00");
    const squares = buildPromoEndCardLayout(input(PROMO_TEMPLATES.find((t) => t.game === "squares")!, { format: "story" }));
    expect(squares.groups.map((group) => group.id)).toEqual(["brand", "title", "when", "art", "prize", "venue", "cta", "follow"]);
    expect(squares.groups.find((group) => group.id === "art")?.text.map((block) => block.text)).toContain("?");
  });

  it("theme files draw with code only: no image files, no external URLs", () => {
    const dir = path.join(process.cwd(), "lib/promo/themes");
    const files = [
      ...readdirSync(dir).map((file) => path.join(dir, file)),
      path.join(process.cwd(), "lib/promo/promoArt.ts"),
      path.join(process.cwd(), "lib/promo/promoMotion.ts"),
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\.(png|jpe?g|webp|gif|svg)["'`]/i);
      expect(source, file).not.toMatch(/https?:\/\//);
    }
  });
});

// The Reel's per-game motion (docs/game-themes-plan.md Phase 3, Standing rules): it lives in the theme,
// is vector blocks like the picture, is the same every time, and hands over seamlessly to the held end
// card (the still picture, D17).
describe("Share to social Reel motion per game", () => {
  const PLANS: readonly [string, ReelPlan, PromoEndCardInput["prizes"]][] = [
    ["with a prize", reelPlan(true), ONE],
    ["without a prize", reelPlan(false), []],
  ];
  const reelCases = PROMO_TEMPLATES.flatMap((template) => PLANS.map(([label, plan, prizes]) => ({ template, label, plan, prizes })));
  /** As lib/promo/promoReelRender.ts: 0 through the beats, easing to 1 over REEL_SETTLE_S. */
  const settleAt = (plan: ReelPlan, t: number) => easeOut((t - plan.end[0]) / REEL_SETTLE_S);
  const storyStage = (template: PromoTemplate, prizes: PromoEndCardInput["prizes"]): ThemeStage =>
    buildPromoEndCardLayout(input(template, { format: "story", prizes })).stage;

  it.each(reelCases)("$template.game $label: every frame is vector blocks at or above the text floor, and bounded", ({ template, plan, prizes }) => {
    const theme = PROMO_THEMES[template.game];
    const stage = storyStage(template, prizes);
    const holdFrom = reelHoldStartS(plan);
    let moved = false;
    for (let frame = 0; frame / REEL_FPS < holdFrom; frame += 1) {
      const t = frame / REEL_FPS;
      const blocks = theme.reel.motion({ t, plan, stage, settle: settleAt(plan, t) });
      moved ||= blocks.shapes.length + blocks.text.length > 0;
      for (const block of blocks.text) expect(px(block.font)).toBeGreaterThanOrEqual(STORY_TEXT_FLOOR_PX);
      // A frame is drawn 30 times a second on a phone: keep each one small.
      expect(blocks.shapes.length + blocks.text.length).toBeLessThan(120);
    }
    expect(moved).toBe(true);
  });

  it.each(reelCases)("$template.game $label: settled, the beat backdrop plus the motion is the picture's backdrop", ({ template, plan, prizes }) => {
    const theme = PROMO_THEMES[template.game];
    const stage = storyStage(template, prizes);
    const backdrop = theme.backdrop(stage);
    const settled = theme.reel.motion({ t: reelHoldStartS(plan), plan, stage, settle: 1 });
    const beat = theme.reel.beatBackdrop?.(stage);
    if (!beat) {
      expect(settled).toEqual({ shapes: [], text: [] });
      return;
    }
    expect([...beat.shapes, ...settled.shapes]).toEqual(backdrop.shapes);
    expect([...beat.text, ...settled.text]).toEqual(backdrop.text);
  });

  it("the motion is the same every time: no randomness or clock in the theme files", () => {
    const dir = path.join(process.cwd(), "lib/promo/themes");
    for (const file of [...readdirSync(dir).map((name) => path.join(dir, name)), path.join(process.cwd(), "lib/promo/promoMotion.ts")]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
    const template = PROMO_TEMPLATES[0];
    const plan = reelPlan(true);
    const stage = storyStage(template, ONE);
    const frame = { t: 1.3, plan, stage, settle: 0 };
    expect(PROMO_THEMES[template.game].reel.motion(frame)).toEqual(PROMO_THEMES[template.game].reel.motion(frame));
  });

  it("the Reel renderer never names a game: what moves lives in the theme", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/promo/promoReelRender.ts"), "utf8");
    for (const template of PROMO_TEMPLATES) expect(source).not.toContain(`"${template.game}"`);
    expect(source).toContain("theme.reel.motion(");
  });
});
