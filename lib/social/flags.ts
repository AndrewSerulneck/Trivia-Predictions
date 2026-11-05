// The ONE reader of NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED (docs/partner-social-promo-plan.md §4.6).
//
// Off (the default) = every /api/owner/social/** route answers 404 (on also needs SOCIAL_POST_NOW_ON_SHEET; the
// Post now box is off the sheet). Share / Download / Copy caption are NOT behind it. Being NEXT_PUBLIC_, a change needs a
// redeploy. Meta's deauthorize / data-deletion callbacks are not behind it either (Meta must reach
// them during App Review).

const truthy = (value: string | undefined): boolean => /^(1|true|yes|on)$/i.test((value ?? "").trim());

export const isSocialPublishEnabled = (): boolean => truthy(process.env.NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED);

// Code switch (Phase 8, docs/partner-social-promo-plan.md §5.2): true only while the Share to social sheet
// renders <SocialPostNowPanel>. D32/D35 took the box off the sheet, so the Post now routes stay sealed even
// with the env flag on. Flip it in the same change that re-attaches the box (contract-tested).
export const SOCIAL_POST_NOW_ON_SHEET = false;

// The gate for every owner social route (app/api/owner/social): the env flag AND the box being on the sheet.
export const isSocialPostNowLive = (): boolean => isSocialPublishEnabled() && SOCIAL_POST_NOW_ON_SHEET;
