import type { SocialPostNowPanelProps } from "@/components/owner/social/SocialPostNowPanel";
import type { PromoFormat } from "@/lib/promo/promoEndCard";
import type { PromoPrize } from "@/lib/promo/promoPrizes";
import type { PromoOption } from "@/lib/promo/promoSubjects";
import type { PromoTemplate } from "@/lib/promo/promoTemplates";

// What the Share to social sheet hands the Post now panel (docs/partner-social-promo-plan.md §5.13, Phase 19).
// Pure, so the wiring is tested while the panel stays unrendered (SOCIAL_POST_NOW_ON_SHEET is off). The sheet
// renders `<SocialPostNowPanel {...postNowProps(…)} />` when it comes back. Two traps it closes:
//   * The sheet's `format` is the PICTURE's: "story" while a Reel is picked (a Reel's still preview is the Story
//     picture). The panel needs "reel" then, or a Reel MP4 goes out as a Story picture; music only with a Reel.
//   * The caption always names the bar. The sheet's "Bar name" tick is for the picture only.

export type PostNowSheetState = {
  open: boolean;
  venueId: string;
  /** The venue's name, whatever the "Bar name" tick says. */
  venueName: string;
  /** A Reel is picked and this browser can make one (the sheet's `isReel`). */
  isReel: boolean;
  /** The sheet's picture format: "story" while a Reel is picked. */
  pictureFormat: PromoFormat;
  musicId: string | null;
  /** The finished picture, or the finished Reel while one is picked; null while it is being made. */
  media: { blob: Blob; fileName: string } | null;
  option: PromoOption | null;
  template: PromoTemplate | null;
  shownPrizes: readonly PromoPrize[];
};

export const postNowProps = (sheet: PostNowSheetState): SocialPostNowPanelProps => ({
  open: sheet.open,
  venueId: sheet.venueId,
  format: sheet.isReel ? "reel" : sheet.pictureFormat,
  media: sheet.media ? { blob: sheet.media.blob, fileName: sheet.media.fileName } : null,
  captionInput:
    sheet.option && sheet.template
      ? { template: sheet.template, when: sheet.option.when, venueName: sheet.venueName, prizes: sheet.shownPrizes }
      : null,
  templateId: sheet.template?.game ?? null,
  scheduleId: sheet.option?.scheduleId ?? null,
  prizeIds: sheet.shownPrizes.map((prize) => prize.id),
  musicId: sheet.isReel ? sheet.musicId : null,
});
