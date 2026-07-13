import { describe, expect, it } from "vitest";
import type { StorySharePayload } from "@/lib/socialShare/contracts";
import {
  resolveStoryCaptionPreset,
  selectStoryCaptionCategory,
  truncateStoryCaption,
} from "@/lib/socialShare/copyPresets";
import { getStoryFrameAssetUrl, resolveStoryShareTemplateVariant } from "@/lib/socialShare/storyAssets";
import {
  buildCategoryBlitzStorySharePayload,
  buildLiveTriviaStorySharePayload,
  prepareStorySharePayload,
} from "@/lib/socialShare/storyPayloads";

const basePayload: StorySharePayload = {
  gameType: "live-trivia",
  venueId: "venue-1",
  venueName: "The High Top",
  userId: "user-1",
  username: "ace",
  title: "Trivia Champion",
  subtitle: "Live Trivia at The High Top",
  finalRank: 1,
  finalPoints: 120,
  correctRate: 80,
  isChampion: true,
  achievedAtIso: "2026-07-11T18:00:00.000Z",
};

describe("story share assets", () => {
  it("selects champion and top-three variants from payload stats", () => {
    expect(resolveStoryShareTemplateVariant({ isChampion: true, finalRank: 1 })).toBe("champion");
    expect(resolveStoryShareTemplateVariant({ isChampion: false, finalRank: 3 })).toBe("top3");
    expect(resolveStoryShareTemplateVariant({ isChampion: false, finalRank: 5 })).toBe("default");
  });

  it("lets requested variants override automatic selection", () => {
    expect(resolveStoryShareTemplateVariant({ isChampion: true, finalRank: 1 }, "minimal")).toBe("minimal");
  });

  it("maps game templates to public frame URLs", () => {
    expect(getStoryFrameAssetUrl("live-trivia", "default")).toBe("/story-frames/live-trivia/default.png");
    expect(getStoryFrameAssetUrl("live-trivia", "champion")).toBe("/story-frames/live-trivia/champion.png");
    expect(getStoryFrameAssetUrl("category-blitz", "champion")).toBe("/story-frames/category-blitz/champion.png");
  });
});

describe("story share copy presets", () => {
  it("selects confident copy for champions and top-three results", () => {
    expect(selectStoryCaptionCategory(basePayload)).toBe("confident");
    expect(selectStoryCaptionCategory({ ...basePayload, isChampion: false, finalRank: 2 })).toBe("confident");
  });

  it("selects polished venue copy for non-podium venue stories", () => {
    expect(selectStoryCaptionCategory({ ...basePayload, isChampion: false, finalRank: 5 })).toBe("polished");
  });

  it("fills venue placeholders and truncates captions for story readability", () => {
    expect(resolveStoryCaptionPreset(basePayload)).toBe("Undisputed. Unbothered. Unstoppable.");
    expect(truncateStoryCaption("This caption is intentionally much longer than the visual story limit for a compact mobile export")).toBe(
      "This caption is intentionally much longer than the visual..."
    );
  });
});

describe("story share payload builders", () => {
  it("builds a Live Trivia payload from postgame stats", () => {
    const payload = buildLiveTriviaStorySharePayload({
      venueId: "venue-1",
      venueName: "The High Top",
      userId: "user-1",
      username: "ace",
      finalRank: 1,
      finalPoints: 120,
      correctRate: 80,
      achievedAtIso: "2026-07-11T18:00:00.000Z",
    });

    expect(payload).toMatchObject({
      gameType: "live-trivia",
      title: "Trivia Champion",
      subtitle: "Live Trivia at The High Top",
      finalRank: 1,
      finalPoints: 120,
      correctRate: 80,
      isChampion: true,
    });
  });

  it("builds a Category Blitz payload from completion standings", () => {
    const payload = buildCategoryBlitzStorySharePayload({
      venueId: "venue-1",
      venueName: "The High Top",
      userId: "user-2",
      username: "speedy",
      finalRank: 2,
      finalPoints: 45,
      achievedAtIso: "2026-07-11T18:30:00.000Z",
    });

    expect(payload).toMatchObject({
      gameType: "category-blitz",
      title: "Category Blitz Run",
      subtitle: "Category Blitz at The High Top",
      finalRank: 2,
      finalPoints: 45,
      correctRate: null,
      isChampion: false,
    });
  });

  it("prepares render-ready story data without game-page context", () => {
    const prepared = prepareStorySharePayload(basePayload);

    expect(prepared.templateVariant).toBe("champion");
    expect(prepared.frameAssetUrl).toBe("/story-frames/live-trivia/champion.png");
    expect(prepared.stats).toEqual([
      { label: "Rank", value: "1st" },
      { label: "Score", value: "120 pts" },
      { label: "Correct", value: "80%" },
    ]);
    expect(prepared.caption).toBe("Undisputed. Unbothered. Unstoppable.");
    expect(prepared.visual).toMatchObject({
      primaryColor: "#8B5CF6",
      badgeLabel: "Trivia Champion",
      ctaLabel: "Play at Hightop",
    });
    expect(prepared.renderSpec).toMatchObject({
      width: 1080,
      height: 1920,
      mirrorPreview: true,
      frameAssetUrl: "/story-frames/live-trivia/champion.png",
    });
    expect(prepared.renderSpec.textBlocks.length).toBeGreaterThanOrEqual(4);
    expect(prepared.renderSpec.textBlocks.some((block) => block.text === "HIGHTOP")).toBe(true);
  });

  it("respects custom captions, template overrides, and export dimensions", () => {
    const prepared = prepareStorySharePayload(
      {
        ...basePayload,
        finalRank: 4,
        isChampion: false,
        funnyCaption: "I knew exactly three answers and vibes handled the rest.",
      },
      {
        templateVariant: "funny",
        width: 720,
        height: 1280,
        mirrorPreview: false,
      }
    );

    expect(prepared.templateVariant).toBe("funny");
    expect(prepared.caption).toBe("I knew exactly three answers and vibes handled the rest.");
    expect(prepared.renderSpec).toMatchObject({
      width: 720,
      height: 1280,
      mirrorPreview: false,
    });
  });
});
