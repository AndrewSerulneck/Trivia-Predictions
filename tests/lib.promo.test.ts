import { describe, expect, it } from "vitest";
import { promoCaption } from "@/lib/promo/promoCaptions";
import { buildPromoEndCardLayout, buildPromoEndCardSpec, type MeasureText, type PromoEndCardInput } from "@/lib/promo/promoEndCard";
import { reelCoverMs, reelFrameCount, reelHoldStartS, reelPlan, reelSfxCues } from "@/lib/promo/promoReel";
import { promoSoundFor } from "@/lib/promo/promoSounds";
import { prizesForGame, promoPrizeOf, type PromoPrizeSource } from "@/lib/promo/promoPrizes";
import { promoFocusOption, promoOptions, scheduleWhen } from "@/lib/promo/promoSubjects";
import { promoTemplateFor } from "@/lib/promo/promoTemplates";
import { STORY_SHARE_SIZES, STORY_TEXT_FLOOR_PX } from "@/lib/socialShare/shareDesigns";
import { SQUARES_PRIZE_DEFINITION_ID } from "@/lib/squaresPrizes";
import type { OwnerSchedule } from "@/types";

// Share to social, Phase 1 (docs/partner-social-promo-plan.md): the prize panel's wording, the "when"
// line, what a venue can promote, the caption, and the end-card layout (D17/D19).

const prize = (overrides: Partial<PromoPrizeSource> = {}): PromoPrizeSource => ({
  id: "p1",
  isActive: true,
  winnerUserId: null,
  rewardDefinitionId: "live_trivia_challenge",
  winCondition: "game_winner",
  pointsRequiredToWin: 500,
  placePrizes: null,
  pickemTiers: null,
  pickemPickLimit: null,
  gameWinnerSlots: null,
  prizeKind: "gift_card",
  prizeMenuItem: null,
  prizeMenuItemName: null,
  prizeDiscountKind: null,
  prizeDiscountValue: null,
  prizeGiftCertificateAmount: 50,
  ...overrides,
});

// Thu Nov 5 2026, 8:00 PM in New York (01:00Z Friday).
const schedule = (overrides: Partial<OwnerSchedule> = {}): OwnerSchedule => ({
  id: "s1",
  venueId: "v1",
  title: "Thursday Trivia",
  startTime: "2026-11-06T01:00:00.000Z",
  endTime: "2026-11-06T03:00:00.000Z",
  timezone: "America/New_York",
  recurringType: "weekly",
  recurringDays: ["thu"],
  windowMinutes: 120,
  isActive: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  gameType: "live_trivia",
  ...overrides,
});

const NOW = Date.parse("2026-11-01T12:00:00.000Z");

describe("promoPrizeOf", () => {
  it("a $50 gift card for winning Live Trivia", () => {
    expect(promoPrizeOf(prize())).toEqual({
      id: "p1",
      headline: "$50 gift card",
      inSentence: "a $50 gift card",
      howToWin: "Win the Live Trivia game",
    });
  });

  it("a points target uses the definition's requirement with the threshold", () => {
    expect(promoPrizeOf(prize({ winCondition: "points_threshold", pointsRequiredToWin: 750 }))?.howToWin).toBe(
      "Earn 750 points in Live Trivia",
    );
  });

  it("drops 'at this venue' (the promo is already about one bar)", () => {
    expect(promoPrizeOf(prize({ rewardDefinitionId: "nfl_pickem_challenge" }))?.howToWin).toBe("Get the most NFL picks right");
  });

  it("weekly places lead with 1st place and say how many places win", () => {
    const placed = prize({
      winCondition: "ranked_places",
      prizeKind: null,
      prizeGiftCertificateAmount: null,
      placePrizes: [2, 1, 3].map((place) => ({
        place,
        prizeKind: "gift_card" as const,
        prizeGiftCertificateAmount: place === 1 ? 100 : 25,
        prizeMenuItem: null,
        prizeMenuItemName: null,
        prizeDiscountKind: null,
        prizeDiscountValue: null,
        prizePosValueCents: null,
        prizePosDelivery: null,
      })),
    });
    expect(promoPrizeOf(placed)).toMatchObject({ headline: "$100 gift card", howToWin: "Finish at the top of Live Trivia this week · Top 3 win" });
  });

  it("a free appetizer reads as one", () => {
    const appetizer = prize({ prizeKind: "menu_item", prizeMenuItem: "appetizer", prizeDiscountKind: "percent", prizeDiscountValue: 100 });
    expect(promoPrizeOf(appetizer)?.headline).toBe("Free appetizer");
  });

  it("a pre-Rewards campaign (no definition) isn't promoted", () => {
    expect(promoPrizeOf(prize({ rewardDefinitionId: null }))).toBeNull();
  });
});

describe("prizesForGame", () => {
  it("only active, not-yet-won prizes for that game", () => {
    const list = [
      prize({ id: "a" }),
      prize({ id: "inactive", isActive: false }),
      prize({ id: "won", winnerUserId: "u1" }),
      prize({ id: "nfl", rewardDefinitionId: "nfl_pickem_challenge" }),
    ];
    expect(prizesForGame(list, "live_trivia", null).map((p) => p.id)).toEqual(["a"]);
    expect(prizesForGame(list, "nfl_pickem", null).map((p) => p.id)).toEqual(["nfl"]);
  });

  it("a prize pinned to other games is left off this game's promo", () => {
    const list = [
      prize({ id: "pinned-here", gameWinnerSlots: [{ scheduleId: "s1", weekday: "thu" }] }),
      prize({ id: "pinned-elsewhere", gameWinnerSlots: [{ scheduleId: "s2", weekday: "tue" }] }),
      prize({ id: "every-game", gameWinnerSlots: null }),
    ];
    expect(prizesForGame(list, "live_trivia", "s1").map((p) => p.id)).toEqual(["pinned-here", "every-game"]);
  });
});

describe("scheduleWhen", () => {
  it("a weekly game: full day name and the time in the venue's zone", () => {
    expect(scheduleWhen(schedule())).toEqual({ days: "Every Thursday", time: "8 PM" });
  });

  it("two days in full, three or more short", () => {
    expect(scheduleWhen(schedule({ recurringDays: ["mon", "thu"] })).days).toBe("Every Monday & Thursday");
    expect(scheduleWhen(schedule({ recurringDays: ["mon", "wed", "fri"] })).days).toBe("Every Mon, Wed & Fri");
  });

  it("a one-off game names its date", () => {
    expect(scheduleWhen(schedule({ recurringType: "none", recurringDays: [] }))).toEqual({ days: "Thursday, Nov 5", time: "8 PM" });
  });

  it("half past shows the minutes", () => {
    expect(scheduleWhen(schedule({ startTime: "2026-11-06T01:30:00.000Z", endTime: "2026-11-06T03:30:00.000Z" })).time).toBe("8:30 PM");
  });
});

describe("promoOptions", () => {
  it("scheduled games first, then everyday games; seasonal ones only with a prize", () => {
    const options = promoOptions({ schedules: [schedule()], prizes: [], nowMs: NOW });
    expect(options.map((option) => option.key)).toEqual(["schedule:s1", "game:pickem", "game:nfl_pickem"]);
    expect(options[0].label).toBe("Live Trivia · Every Thursday · 8 PM");
  });

  it("Super Bowl Squares appears while the venue offers a Squares prize", () => {
    const without = promoOptions({ schedules: [], prizes: [], nowMs: NOW });
    expect(without.map((option) => option.game)).not.toContain("squares");
    const options = promoOptions({ schedules: [], prizes: [prize({ rewardDefinitionId: SQUARES_PRIZE_DEFINITION_ID })], nowMs: NOW });
    expect(options.map((option) => option.game)).toContain("squares");
    expect(options.map((option) => option.game)).not.toContain("bracket");
  });

  it("an inactive schedule isn't offered", () => {
    expect(promoOptions({ schedules: [schedule({ isActive: false })], prizes: [], nowMs: NOW }).map((o) => o.game)).not.toContain(
      "live_trivia",
    );
  });
});

describe("promoCaption", () => {
  it("names the game, venue, when, the prize and the app; never 'reward'", () => {
    const caption = promoCaption({
      template: promoTemplateFor("live_trivia"),
      when: { days: "Every Thursday", time: "8 PM" },
      venueName: "The Pour House",
      prizes: [{ inSentence: "a $50 gift card" }],
    });
    expect(caption).toContain("Live Trivia at The Pour House, every Thursday at 8 PM!");
    expect(caption).toContain("Win a $50 gift card.");
    expect(caption).toContain("Play on Hightop Challenge: hightopchallenge.com/app");
    expect(caption).toContain("#thepourhouse");
    expect(caption).not.toMatch(/reward/i);
  });

  it("several prizes: the first and 'and more'; none: no prize line", () => {
    const base = { template: promoTemplateFor("pickem"), when: { days: "Make your picks every week", time: null }, venueName: null };
    expect(promoCaption({ ...base, prizes: [{ inSentence: "a free appetizer" }, { inSentence: "a $10 gift card" }] })).toContain(
      "Win a free appetizer and more.",
    );
    expect(promoCaption({ ...base, prizes: [] })).not.toContain("Win ");
  });
});

describe("buildPromoEndCardSpec", () => {
  // ~0.55em per character: close enough to Nunito to exercise wrapping and centring.
  const measure: MeasureText = (text, font) => text.length * Number(font.match(/(\d+)px/)?.[1] ?? 40) * 0.55;
  const input = (overrides: Partial<PromoEndCardInput> = {}): PromoEndCardInput => ({
    format: "story",
    template: promoTemplateFor("live_trivia"),
    when: { days: "Every Thursday", time: "8 PM" },
    venueName: "The Pour House",
    instagramHandle: "thepourhouse",
    prizes: [{ headline: "$50 gift card", howToWin: "Win the Live Trivia game" }],
    measure,
    ...overrides,
  });
  const texts = (spec: ReturnType<typeof buildPromoEndCardSpec>) => spec.textBlocks.map((block) => block.text);
  const px = (fontString: string) => Number(fontString.match(/(\d+)px/)?.[1]);

  it("says it all: game, when, prize, how to win, venue, handle, call to action", () => {
    const all = texts(buildPromoEndCardSpec(input()));
    for (const expected of ["LIVE", "TRIVIA", "8 PM", "WIN", "$50 gift card", "Win the Live Trivia game", "The Pour House", "@thepourhouse", "Play on Hightop Challenge"]) {
      expect(all).toContain(expected);
    }
  });

  it("no QR code and no images at all (D19)", () => {
    for (const format of ["post", "story"] as const) {
      expect(buildPromoEndCardSpec(input({ format })).images ?? []).toEqual([]);
    }
  });

  it("no prize: no prize card", () => {
    const all = texts(buildPromoEndCardSpec(input({ prizes: [] })));
    expect(all).not.toContain("WIN");
  });

  it("hidden name/handle stay off the picture", () => {
    const all = texts(buildPromoEndCardSpec(input({ venueName: null, instagramHandle: null })));
    expect(all).not.toContain("The Pour House");
    expect(all.some((text) => text.startsWith("@"))).toBe(false);
  });

  it("every line sits inside Instagram's safe zone, at or above the text floor, in both sizes and with 4 prizes", () => {
    const many = ["$50 gift card", "Free appetizer", "20% off your whole order", "$10 gift card"].map((headline) => ({
      headline,
      howToWin: "Finish at the top of Live Trivia this week · Top 3 win",
    }));
    for (const format of ["post", "story"] as const) {
      for (const prizes of [[], input().prizes, many]) {
        const spec = buildPromoEndCardSpec(input({ format, prizes }));
        const size = STORY_SHARE_SIZES[format];
        for (const block of spec.textBlocks) {
          expect(block.centerY ?? block.y).toBeGreaterThanOrEqual(size.safeTop);
          expect(block.centerY ?? block.y).toBeLessThanOrEqual(size.height - size.safeBottom);
          expect(px(block.font)).toBeGreaterThanOrEqual(STORY_TEXT_FLOOR_PX);
        }
      }
    }
  });

  it("four prizes list three (two when the picture is tight) and '+ N more'", () => {
    const four = ["A", "B", "C", "D"].map((headline) => ({ headline: `${headline} prize`, howToWin: "Win" }));
    for (const format of ["post", "story"] as const) {
      const all = texts(buildPromoEndCardSpec(input({ format, prizes: four })));
      const listed = ["A prize", "B prize", "C prize"].filter((text) => all.includes(text));
      expect(listed.length).toBeGreaterThanOrEqual(2);
      const more = 4 - listed.length;
      expect(all).toContain(`+ ${more} more prize${more === 1 ? "" : "s"}`);
      expect(all).not.toContain("D prize");
    }
  });
});

describe("buildPromoEndCardLayout (the Reel animates these rows into the end card)", () => {
  const measure: MeasureText = (text, font) => text.length * Number(font.match(/(\d+)px/)?.[1] ?? 40) * 0.55;
  const input: PromoEndCardInput = {
    format: "story",
    template: promoTemplateFor("live_trivia"),
    when: { days: "Every Thursday", time: "8 PM" },
    venueName: "The Pour House",
    instagramHandle: "thepourhouse",
    prizes: [{ headline: "$50 gift card", howToWin: "Most points wins" }],
    measure,
  };

  it("names each row in order, top to bottom", () => {
    const { groups } = buildPromoEndCardLayout(input);
    expect(groups.map((group) => group.id)).toEqual(["brand", "title", "when", "prize", "venue", "cta", "follow"]);
    for (let i = 1; i < groups.length; i += 1) expect(groups[i].top).toBeGreaterThan(groups[i - 1].top);
  });

  it("the small follow tag sits bottom-right, inside the safe zone and below the CTA (Andrew, 2026-11-04)", () => {
    for (const format of ["post", "story"] as const) {
      const size = STORY_SHARE_SIZES[format];
      const { groups } = buildPromoEndCardLayout({ ...input, format });
      const cta = groups.find((group) => group.id === "cta");
      const follow = groups.find((group) => group.id === "follow");
      expect(follow?.text[0]).toMatchObject({ text: "Follow @thehightopchallenge", align: "right" });
      expect(follow!.text[0].x).toBeGreaterThan(size.width / 2);
      expect(follow!.top).toBeGreaterThanOrEqual(cta!.top + cta!.height);
      expect(follow!.top + follow!.height).toBeLessThanOrEqual(size.height - size.safeBottom);
    }
  });

  it("the address, when ticked, is a line under the bar name", () => {
    const { groups } = buildPromoEndCardLayout({ ...input, venueAddress: "1010 Pacific St · Brooklyn, NY" });
    const venue = groups.find((group) => group.id === "venue");
    expect(venue?.text.map((block) => block.text)).toContain("1010 Pacific St · Brooklyn, NY");
  });

  it("the rows hold exactly the picture's blocks, so the Reel's last frame is the Post/Story picture (D17)", () => {
    const { spec, groups } = buildPromoEndCardLayout(input);
    expect(groups.flatMap((group) => group.text)).toEqual(spec.textBlocks);
    // The game's backdrop artwork is the one layer that isn't in a row (spec.backdrop).
    expect(groups.flatMap((group) => group.shapes)).toEqual(spec.shapes ?? []);
    expect(buildPromoEndCardSpec(input)).toEqual(spec);
  });

  it("no prize: no prize row", () => {
    const { groups } = buildPromoEndCardLayout({ ...input, prizes: [] });
    expect(groups.map((group) => group.id)).not.toContain("prize");
  });
});

describe("the Reel timeline and sound (Phase 2, D17, D21)", () => {
  it("15 s with a prize, 10 s without; the beats run in order and end on the end card", () => {
    const withPrize = reelPlan(true);
    expect(withPrize.durationS).toBe(15);
    expect([withPrize.title[1], withPrize.when[1], withPrize.roll?.[1], withPrize.prize?.[1]]).toEqual([
      withPrize.when[0],
      withPrize.roll?.[0],
      withPrize.prize?.[0],
      withPrize.end[0],
    ]);
    expect(withPrize.end[1]).toBe(15);
    const without = reelPlan(false);
    expect(without.durationS).toBe(10);
    expect(without.roll).toBeNull();
    expect(without.prize).toBeNull();
    expect(without.end).toEqual([6.5, 10]);
  });

  it("the end card is held for the last ~3 s, and is the cover frame", () => {
    for (const plan of [reelPlan(true), reelPlan(false)]) {
      expect(plan.durationS - reelHoldStartS(plan)).toBeGreaterThanOrEqual(2.5);
      expect(reelCoverMs(plan)).toBe(Math.round(reelHoldStartS(plan) * 1000));
    }
    expect(reelFrameCount(reelPlan(true))).toBe(450);
  });

  it("opens with applause, no whistle; the prize brings the drumroll, the crowd and the ka-ching", () => {
    const cues = reelSfxCues(reelPlan(true));
    expect(cues[0]).toMatchObject({ soundId: "applause-cheer", atS: 0 });
    expect(cues.map((cue) => cue.soundId)).toEqual(["applause-cheer", "drumroll", "stadium-crowd", "applause-cheer", "ka-ching"]);
    expect(cues.some((cue) => /whistle/.test(cue.soundId))).toBe(false);
    expect(reelSfxCues(reelPlan(false)).map((cue) => cue.soundId)).toEqual(["applause-cheer"]);
  });

  it("every cue is a registered sound effect and fits inside the Reel", () => {
    for (const plan of [reelPlan(true), reelPlan(false)]) {
      for (const cue of reelSfxCues(plan)) {
        expect(promoSoundFor(cue.soundId).kind).toBe("sfx");
        expect(cue.atS).toBeGreaterThanOrEqual(0);
        expect(cue.atS).toBeLessThan(plan.durationS);
        expect(cue.gain).toBeGreaterThan(0);
        expect(cue.gain).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("promoFocusOption (the end-of-flow prompt, plan §4.5)", () => {
  const s1 = schedule({ id: "s1" });
  const s2 = schedule({ id: "s2", startTime: "2026-11-13T01:00:00.000Z", endTime: "2026-11-13T03:00:00.000Z" });
  const options = promoOptions({ schedules: [s1, s2], prizes: [], nowMs: NOW });

  it("a new game opens on its own option, not the soonest", () => {
    expect(promoFocusOption(options, [], { scheduleId: "s2" })?.scheduleId).toBe("s2");
  });

  it("a new prize opens on the game it is for", () => {
    const nfl = prize({ id: "n1", rewardDefinitionId: "nfl_pickem_challenge" });
    const withNfl = promoOptions({ schedules: [s1], prizes: [nfl], nowMs: NOW });
    expect(promoFocusOption(withNfl, [nfl], { rewardId: "n1" })?.game).toBe("nfl_pickem");
  });

  it("a prize pinned to one scheduled game opens on that game", () => {
    const pinned = prize({ id: "p2", gameWinnerSlots: [{ scheduleId: "s2" }] as PromoPrizeSource["gameWinnerSlots"] });
    expect(promoFocusOption(options, [pinned], { rewardId: "p2" })?.scheduleId).toBe("s2");
  });

  it("nothing found (list not refetched yet) or no focus: null, so the sheet uses its first game", () => {
    expect(promoFocusOption(options, [], { scheduleId: "gone" })).toBeNull();
    expect(promoFocusOption(options, [], { rewardId: "gone" })).toBeNull();
    expect(promoFocusOption(options, [], null)).toBeNull();
  });
});
