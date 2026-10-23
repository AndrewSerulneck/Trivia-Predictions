import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { APP_DOWNLOAD_DISPLAY_URL } from "@/lib/appDownloadLink";
import type { StorySharePayload } from "@/lib/socialShare/contracts";
import { SHARE_PLAY_LINE, shareWinHeadline, sharePrizeInSentence } from "@/lib/socialShare/copyPresets";
import {
  buildShareDesignSpec,
  readyMadeDesignsFor,
  STORY_SHARE_SIZE_ORDER,
  STORY_SHARE_SIZES,
  STORY_TEXT_FLOOR_PX,
  type StoryShareDesign,
} from "@/lib/socialShare/shareDesigns";
import { STORY_SHARE_GAME_TYPES, STORY_SHARE_GAMES } from "@/lib/socialShare/shareGames";
import { SHARE_QR_SRC } from "@/lib/socialShare/shareQr";
import { formatShareVenueAddress } from "@/lib/socialShare/shareVenue";
import {
  buildPrizeStorySharePayload,
  buildStorySharePayload,
  prepareStorySharePayload,
} from "@/lib/socialShare/storyPayloads";

// docs/native-app-store-plan.md Phase 9b: the share pictures.

const DESIGNS: StoryShareDesign[] = ["spotlight", "card", "night", "selfie"];
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

const prizePayload = (prize: StorySharePayload["prize"] & object, venueName: string | null = "The Pour House") =>
  buildPrizeStorySharePayload({ venueId: "v1", venueName, venueAddress: ADDRESS, userId: "u1", username: "ace", prize });

const fontPx = (font: string): number => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 0);

/** Every payload shape × every game × design × size the pictures can be drawn for. */
const everySpec = () => {
  const payloads: StorySharePayload[] = [
    ...STORY_SHARE_GAME_TYPES.map((gameType) => gamePayload({ gameType })),
    gamePayload({ isChampion: false, finalRank: 4, venueAddress: null }),
    gamePayload({ venueName: "Seven Sirens Brewing Company of the Greater Lehigh Valley", venueAddress: null }),
    prizePayload({ headline: "$15", headlineKind: "amount", label: "GIFT CARD" }),
    prizePayload({ headline: "50% Off Appetizer", headlineKind: "phrase", label: "PRIZE" }, null),
    // Phase 9e: the venue's @handle under the name (the tallest venue panel), and a handle with no name.
    gamePayload({ venueInstagram: "thepourhouse" }),
    gamePayload({ venueName: "Seven Sirens Brewing Company of the Greater Lehigh Valley", venueInstagram: "sevensirensbrewingcompany_lv" }),
    { ...prizePayload({ headline: "$15", headlineKind: "amount", label: "GIFT CARD" }), venueInstagram: "thepourhouse" },
    gamePayload({ venueName: null, venueAddress: null, venueInstagram: "thepourhouse" }),
  ];
  return payloads.flatMap((payload) =>
    STORY_SHARE_SIZE_ORDER.flatMap((size) => {
      const prepared = prepareStorySharePayload(payload, { size });
      return DESIGNS.map((design) => ({ payload, size, design, spec: buildShareDesignSpec(prepared, design, size) }));
    })
  );
};

describe("share picture headline (Andrew, 2026-10-22, decision 4)", () => {
  it("a gift card with an amount: Andrew's exact words", () => {
    expect(shareWinHeadline(prizePayload({ headline: "$15", headlineKind: "amount", label: "GIFT CARD" }))).toBe(
      "I just won $15 off my tab at The Pour House!"
    );
  });

  it("any other prize names the prize, never 'off my tab'", () => {
    expect(shareWinHeadline(prizePayload({ headline: "Free Appetizer", headlineKind: "phrase", label: "PRIZE" }))).toBe(
      "I just won a Free Appetizer at The Pour House!"
    );
    expect(shareWinHeadline(prizePayload({ headline: "Gift Card", headlineKind: "phrase", label: "GIFT CARD" }))).toBe(
      "I just won a Gift Card at The Pour House!"
    );
    expect(sharePrizeInSentence({ headline: "50% Off Appetizer", headlineKind: "phrase", label: "PRIZE" })).toBe(
      "50% off an Appetizer"
    );
    expect(sharePrizeInSentence({ headline: "$10 Off Entrée", headlineKind: "phrase", label: "PRIZE" })).toBe("$10 off an Entrée");
    expect(sharePrizeInSentence({ headline: "Bottle of Wine", headlineKind: "phrase", label: "PRIZE" })).toBe("a Bottle of Wine");
  });

  it("a game won with no prize; a finish; no venue on file", () => {
    expect(shareWinHeadline(gamePayload())).toBe("I just won Live Trivia at The Pour House!");
    expect(shareWinHeadline(gamePayload({ isChampion: false, finalRank: 3 }))).toBe("I finished 3rd in Live Trivia at The Pour House!");
    expect(shareWinHeadline(gamePayload({ isChampion: false, finalRank: null }))).toBe("I just played Live Trivia at The Pour House!");
    expect(shareWinHeadline(gamePayload({ venueName: null }))).toBe("I just won Live Trivia!");
  });

  it("is the line every design leads with", () => {
    for (const { payload, design, size, spec } of everySpec()) {
      expect(spec.textBlocks.some((block) => block.text === shareWinHeadline(payload)), `${design} ${size}`).toBe(true);
    }
  });
});

describe("share picture layout", () => {
  it("no text below the 12px floor at phone width", () => {
    for (const { design, size, spec } of everySpec()) {
      for (const block of spec.textBlocks) {
        const label = `${design} ${size}: "${block.text}"`;
        expect(fontPx(block.font), label).toBeGreaterThanOrEqual(STORY_TEXT_FLOOR_PX);
        if (block.fitMinPx != null) expect(block.fitMinPx, label).toBeGreaterThanOrEqual(STORY_TEXT_FLOOR_PX);
      }
    }
  });

  it("every design names the bar (name + street + city) and the app", () => {
    for (const { payload, design, size, spec } of everySpec().filter(({ payload }) => payload.venueAddress && payload.venueName)) {
      const texts = spec.textBlocks.map((block) => block.text);
      expect(texts, `${design} ${size}`).toEqual(expect.arrayContaining([
        payload.venueName, "1010 Pacific St", "Brooklyn, NY", SHARE_PLAY_LINE, APP_DOWNLOAD_DISPLAY_URL,
      ]));
    }
  });

  it("no directions: nothing on the picture links or points to a map", () => {
    for (const { spec } of everySpec()) {
      for (const block of spec.textBlocks) expect(block.text).not.toMatch(/maps|directions/i);
    }
  });

  it("a venue with no address shows its name only", () => {
    const prepared = prepareStorySharePayload(gamePayload({ venueAddress: null }));
    const texts = buildShareDesignSpec(prepared, "spotlight", "story").textBlocks.map((block) => block.text);
    expect(texts).toContain("The Pour House");
    expect(texts).not.toContain("1010 Pacific St");
  });

  it("on a Story, the QR and the venue panel stay out of Instagram's top 250 / bottom 340 px", () => {
    const { safeTop, safeBottom, height } = STORY_SHARE_SIZES.story;
    for (const { design, spec } of everySpec().filter(({ size }) => size === "story")) {
      const qr = (spec.images ?? []).find((image) => image.src === SHARE_QR_SRC);
      expect(qr, design).toBeDefined();
      expect(qr!.y, design).toBeGreaterThanOrEqual(safeTop);
      expect(qr!.y + qr!.height, design).toBeLessThanOrEqual(height - safeBottom);
      for (const text of ["The Pour House", APP_DOWNLOAD_DISPLAY_URL, SHARE_PLAY_LINE]) {
        const block = spec.textBlocks.find((candidate) => candidate.text === text);
        if (!block) continue;
        expect(block.y, `${design} "${text}"`).toBeGreaterThanOrEqual(safeTop);
        expect(block.y, `${design} "${text}"`).toBeLessThanOrEqual(height - safeBottom);
      }
    }
  });

  it("two sizes: Story 1080×1920 and feed post 1080×1350", () => {
    expect(STORY_SHARE_SIZES.story).toMatchObject({ width: 1080, height: 1920 });
    expect(STORY_SHARE_SIZES.post).toMatchObject({ width: 1080, height: 1350 });
    for (const { size, spec } of everySpec()) {
      expect([spec.width, spec.height]).toEqual([STORY_SHARE_SIZES[size].width, STORY_SHARE_SIZES[size].height]);
    }
  });

  it("ready-made designs need no photo; only the selfie uses one, and a prize leads with its card", () => {
    for (const { design, spec } of everySpec()) {
      if (design === "selfie") expect(spec.background ?? null).toBeNull();
      else expect(spec.background, design).toBeTruthy();
    }
    expect(readyMadeDesignsFor(prepareStorySharePayload(gamePayload()))).toEqual(["spotlight", "card", "night"]);
    expect(readyMadeDesignsFor(prepareStorySharePayload(prizePayload({ headline: "$15", headlineKind: "amount", label: "GIFT CARD" }))))
      .toEqual(["card", "spotlight", "night"]);
  });

  it("the selfie frame is drawn only at Story size, only for games that have one", () => {
    const prepared = prepareStorySharePayload(gamePayload({ isChampion: true }));
    expect(buildShareDesignSpec(prepared, "selfie", "story").frameAssetUrl).toBe("/story-frames/live-trivia/champion.png");
    expect(buildShareDesignSpec(prepared, "selfie", "post").frameAssetUrl).toBeNull();
    const bingo = prepareStorySharePayload(gamePayload({ gameType: "bingo" }));
    expect(buildShareDesignSpec(bingo, "selfie", "story").frameAssetUrl).toBeNull();
  });
});

describe("venue address on the picture", () => {
  it("street + 'City, ST'; a full address stored in street keeps only the street", () => {
    expect(formatShareVenueAddress({ street: "1194 Englishtown Road", address: "1194 Englishtown Road, Old Bridge, NJ 08857, United States", city: "Old Bridge", state: "NJ" }))
      .toEqual({ street: "1194 Englishtown Road", locality: "Old Bridge, NJ" });
    expect(formatShareVenueAddress({ street: "1010 Pacific St, Brooklyn, NY 11238, USA", city: "Brooklyn", state: "NY" }))
      .toEqual({ street: "1010 Pacific St", locality: "Brooklyn, NY" });
    expect(formatShareVenueAddress({ address: "327 Broadway, Bethlehem, PA 18015", city: "Bethlehem" }))
      .toEqual({ street: "327 Broadway", locality: "Bethlehem" });
    expect(formatShareVenueAddress({})).toBeNull();
  });
});

describe("share game registry", () => {
  it("Live Trivia and Category Blitz keep their pre-registry values", () => {
    expect(STORY_SHARE_GAMES["live-trivia"]).toMatchObject({
      label: "Live Trivia",
      championTitle: "Trivia Champion",
      runTitle: "Live Trivia Victory",
      ctaLabel: "Play at Hightop",
      colors: { primary: "#8B5CF6", secondary: "#06B6D4" },
    });
    expect(STORY_SHARE_GAMES["category-blitz"]).toMatchObject({
      label: "Category Blitz",
      championTitle: "Blitz Champion",
      runTitle: "Category Blitz Run",
      ctaLabel: "Play Category Blitz",
      colors: { primary: "#EC4899", secondary: "#84CC16" },
    });
  });

  it("no layout or share component names a game id — a game is a registry entry", () => {
    const files = [
      "lib/socialShare/shareDesigns.ts",
      "lib/socialShare/copyPresets.ts",
      "lib/socialShare/storyCanvas.ts",
      ...readdirSync(join(process.cwd(), "components/social-share")).map((file) => `components/social-share/${file}`),
    ];
    for (const file of files) {
      const code = readFileSync(join(process.cwd(), file), "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
      for (const gameType of STORY_SHARE_GAME_TYPES) {
        // A branch on a game: `=== "bingo"`, `case "bingo"`, `gameType: "bingo"` (a field NAME like "prize" is fine).
        const branch = new RegExp(`(===|!==|case|gameType:)\\s*"${gameType}"`);
        expect(branch.test(code), `${file} branches on "${gameType}"`).toBe(false);
      }
    }
  });

  it("on-screen share copy says Prize, never Reward", () => {
    for (const file of ["lib/socialShare/copyPresets.ts", "lib/socialShare/shareGames.ts", "lib/socialShare/shareDesigns.ts"]) {
      const code = readFileSync(join(process.cwd(), file), "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
      expect(code, file).not.toMatch(/"[^"]*Reward[^"]*"/);
    }
  });
});
