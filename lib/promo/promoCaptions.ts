import { APP_DOWNLOAD_DISPLAY_URL } from "@/lib/appDownloadLink";
import { SHARE_PLAY_LINE } from "@/lib/socialShare/copyPresets";
import type { PromoPrize } from "@/lib/promo/promoPrizes";
import type { PromoWhen } from "@/lib/promo/promoSubjects";
import type { PromoTemplate } from "@/lib/promo/promoTemplates";

// The suggested caption under a Share to social post (docs/partner-social-promo-plan.md §4.2). Plain
// text the partner can edit; Instagram doesn't link URLs in captions, so the app link is written out.
// On screen it is always "prize", never "reward" (tests/prizes-wording-contract.test.ts). Pure.

export type PromoCaptionInput = {
  template: Pick<PromoTemplate, "name" | "hashtags">;
  when: PromoWhen;
  venueName: string | null;
  prizes: readonly Pick<PromoPrize, "inSentence">[];
};

/** "every Thursday at 8 PM", "Thursday, Nov 6 at 8 PM", "make your picks every week". */
const whenInSentence = (when: PromoWhen): string => {
  const days = when.days.startsWith("Every ") || when.days.startsWith("Make ") || when.days.startsWith("Play ")
    ? `${when.days[0].toLowerCase()}${when.days.slice(1)}`
    : when.days;
  return when.time ? `${days} at ${when.time}` : days;
};

const hashtagOf = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

export const promoCaption = ({ template, when, venueName, prizes }: PromoCaptionInput): string => {
  const where = venueName ? ` at ${venueName}` : "";
  const first = when.time
    ? `${template.name}${where}, ${whenInSentence(when)}!`
    : `${template.name}${where}: ${whenInSentence(when)}!`;
  const prizeLine =
    prizes.length === 0
      ? null
      : prizes.length === 1
        ? `Win ${prizes[0].inSentence}.`
        : `Win ${prizes[0].inSentence} and more.`;
  const venueTag = venueName ? hashtagOf(venueName) : "";
  const tags = [...template.hashtags, ...(venueTag ? [venueTag] : [])].map((tag) => `#${tag}`).join(" ");
  return [first, prizeLine, `${SHARE_PLAY_LINE}: ${APP_DOWNLOAD_DISPLAY_URL}`, "", tags]
    .filter((line): line is string => line !== null)
    .join("\n");
};
