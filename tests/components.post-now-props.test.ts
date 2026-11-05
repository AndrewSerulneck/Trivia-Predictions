import { describe, expect, it } from "vitest";
import { postNowProps, type PostNowSheetState } from "@/components/owner/social/postNowProps";
import { promoCaption } from "@/lib/promo/promoCaptions";

// docs/partner-social-promo-plan.md §5.13, Phase 19 (third review #1): what the Share to social sheet hands the
// Post now panel, tested while the panel stays unrendered (SOCIAL_POST_NOW_ON_SHEET is off).

const template = { game: "live_trivia", name: "Live Trivia", hashtags: ["trivia"] } as unknown as PostNowSheetState["template"];
const option = {
  key: "schedule:s1",
  game: "live_trivia",
  scheduleId: "s1",
  label: "Live Trivia · Every Thursday · 8 PM",
  when: { days: "Every Thursday", time: "8 PM" },
} as unknown as PostNowSheetState["option"];
const prize = { id: "p1", headline: "$50 gift card", inSentence: "a $50 gift card", howToWin: "Win the game" } as unknown as PostNowSheetState["shownPrizes"][number];
const blob = new Blob(["x"]);

const sheet = (over: Partial<PostNowSheetState> = {}): PostNowSheetState => ({
  open: true,
  venueId: "v1",
  venueName: "The Bar",
  isReel: false,
  pictureFormat: "post",
  musicId: "game-night-beat",
  media: { blob, fileName: "hightop-live-trivia-post.jpg" },
  option,
  template,
  shownPrizes: [prize],
  ...over,
});

describe("postNowProps (sheet → Post now panel)", () => {
  it("a Reel goes out as a Reel with its music, although the sheet's picture format is the Story", () => {
    const props = postNowProps(sheet({ isReel: true, pictureFormat: "story", media: { blob, fileName: "hightop-live-trivia-reel.mp4" } }));
    expect(props.format).toBe("reel");
    expect(props.musicId).toBe("game-night-beat");
    expect(props.media).toEqual({ blob, fileName: "hightop-live-trivia-reel.mp4" });
  });

  it("a Post or a Story goes out as itself, with no music", () => {
    expect(postNowProps(sheet())).toMatchObject({ format: "post", musicId: null });
    expect(postNowProps(sheet({ pictureFormat: "story" }))).toMatchObject({ format: "story", musicId: null });
  });

  it("the caption names the bar: the sheet hands over the venue's name, never the picture's (Bar name tick)", () => {
    const props = postNowProps(sheet());
    expect(props.captionInput?.venueName).toBe("The Bar");
    expect(promoCaption(props.captionInput!)).toContain("Live Trivia at The Bar");
  });

  it("passes only the file and its name, the game, the schedule and the shown prizes", () => {
    const props = postNowProps(sheet({ media: { blob, fileName: "a.jpg", url: "blob:x" } as PostNowSheetState["media"] }));
    expect(props).toEqual({
      open: true,
      venueId: "v1",
      format: "post",
      media: { blob, fileName: "a.jpg" },
      captionInput: { template, when: { days: "Every Thursday", time: "8 PM" }, venueName: "The Bar", prizes: [prize] },
      templateId: "live_trivia",
      scheduleId: "s1",
      prizeIds: ["p1"],
      musicId: null,
    });
  });

  it("before a game is picked or while the media is being made: nothing to post yet", () => {
    expect(postNowProps(sheet({ option: null, template: null, media: null, shownPrizes: [] }))).toMatchObject({
      media: null,
      captionInput: null,
      templateId: null,
      scheduleId: null,
      prizeIds: [],
    });
  });
});
