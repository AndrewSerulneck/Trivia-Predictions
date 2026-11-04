// The ONE reader of NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED (docs/partner-social-promo-plan.md §4.6).
//
// Off (the default) = no "Post now" panel in Share to social and every /api/owner/social/** route
// answers 404. Share / Download / Copy caption are NOT behind it. Being NEXT_PUBLIC_, a change needs a
// redeploy. Meta's deauthorize / data-deletion callbacks are not behind it either (Meta must reach
// them during App Review).

const truthy = (value: string | undefined): boolean => /^(1|true|yes|on)$/i.test((value ?? "").trim());

export const isSocialPublishEnabled = (): boolean => truthy(process.env.NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED);
