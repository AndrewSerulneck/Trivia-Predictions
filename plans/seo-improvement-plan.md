# SEO Improvement Plan for Hightop Challenge

## Goal
Improve search visibility so Hightop Challenge appears when bar owners, restaurant managers, and hospitality operators search for ways to increase sales, engage guests, or add entertainment to their venue — without hurting existing player-facing pages.

## Current State (verified against the codebase)
- `app/sitemap.ts` — `MARKETING_PATHS` array is empty (corrupted); sitemap currently emits zero URLs.
- `app/info/layout.tsx` — already has `Organization` + `WebApplication` JSON-LD, and metadata already targets venue operators ("Venue Gaming Platform for Bars and Restaurants", "drive repeat visits"-style copy). This page is in good shape.
- `app/faqs/layout.tsx` / `app/faqs/page.tsx` — metadata and all Q&A content are 100% player-facing (points, prizes, games). No venue-operator content exists here at all.
- `app/advertise/page.tsx` — has good metadata already, already mentions "venue partners."
- `app/owner/login/page.tsx` — bare client-rendered email/password form, no marketing copy, no unique content, not something a cold searcher should land on.
- `public/robots.txt` — correct, allows major crawlers, references `/sitemap.xml`.
- `app/layout.tsx` — root metadata already says "for bars and restaurants."
- No Google Search Console verification.
- No content (blog/landing pages) written for operator search intent — this is the biggest gap, not structured data.

## Guiding rule
Metadata and structured data should only claim what the page's visible content actually delivers. Don't retarget a page's keywords toward an audience its content doesn't serve — Google penalizes the mismatch and it produces high-bounce clicks.

## Phase 1: Fix the sitemap (broken, ships nothing today)

**File:** `app/sitemap.ts`

Restore `MARKETING_PATHS`:

```typescript
const MARKETING_PATHS: {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}[] = [
  { path: "/info", priority: 1.0, changeFrequency: "weekly" },
  { path: "/faqs", priority: 0.5, changeFrequency: "monthly" },
  { path: "/advertise", priority: 0.5, changeFrequency: "monthly" },
];
```

`/owner/login` stays out of the sitemap and gets `robots: { index: false }` in its metadata (Phase 4) — it's a bare auth form with no unique content and shouldn't be a landing page for cold search traffic.

## Phase 2: Google Search Console

1. Verify domain ownership (`verification.google` in `app/layout.tsx` metadata, once the user supplies the code from GSC).
2. Confirm `NEXT_PUBLIC_SITE_URL` is set correctly in production — the sitemap silently falls back to `https://hightopchallenge.com` if it's unset, which may be wrong post domain-split.
3. Submit `/sitemap.xml` in GSC after verification.
4. Monitor Coverage + Performance reports for operator-intent queries ("bar trivia platform", "increase bar sales entertainment", etc.) once indexed.

## Phase 3: Structured data — additive only, no retargeting

- **Organization schema (`app/info/layout.tsx`)**: expand existing block with `sameAs` (Instagram/Facebook if they exist) and `contactPoint` (email). Small, safe addition.
- **FAQPage schema**: only add this to a page whose content is actually operator-facing (see Phase 5's new landing page), not to `/faqs`, since that page's Q&A is player-only — adding FAQPage schema there would be accurate schema on inaccurate targeting.
- **Do not add `LocalBusiness` schema.** Hightop Challenge is a multi-venue platform, not a single physical location — that schema type would misrepresent the business and risks a manual action.
- **BreadcrumbList**: skip for now — the marketing surface is only 3-4 flat pages deep; not enough hierarchy to matter yet. Revisit once the operator content section (Phase 5) has sub-pages.

## Phase 4: Metadata corrections

- **`app/layout.tsx`**: keep as-is — already mentions bars/restaurants without over-indexing on operator keywords at the expense of players. Low priority.
- **`app/info/layout.tsx`**: already good. No change needed.
- **`app/faqs/layout.tsx`**: **do not** retarget toward venue partners — leave it player-focused, matching its content.
- **`app/owner/login/page.tsx`**: add a metadata export with `robots: { index: false, follow: false }`. This is an auth gate, not a marketing surface — funnel operator search traffic to `/info` and `/advertise` instead, which already target them.

## Phase 5: Content — the actual lever for this goal

Structured data and metadata tuning are necessary but not sufficient for ranking on competitive commercial queries like "how to increase bar sales." That requires content that directly answers the query and external signals (backlinks).

1. **New operator-facing content page(s)** under `/info` or a new `/info/[topic]` route — e.g. "Trivia Night Ideas to Increase Bar Revenue," "Guest Engagement Platform for Restaurants & Bars." Long-form enough to compete, written to answer the actual search queries named in the Goal section. This is where FAQPage / HowTo schema would actually be honest to add.
2. **Backlinks / citations**: outreach to hospitality trade publications, POS/restaurant-tech directories, and local restaurant associations. Domain authority from relevant industry sites moves this needle more than any on-page schema change.
3. Revisit internal linking once the new content exists (`/info` → new content pages → `/advertise`), which is when BreadcrumbList becomes worth adding.

## Files to Modify (Phases 1-4)

| File | Change |
|------|--------|
| `app/sitemap.ts` | Fix corrupted array |
| `app/layout.tsx` | Add `verification.google` once code is available |
| `app/info/layout.tsx` | Expand Organization JSON-LD (`sameAs`, `contactPoint`) |
| `app/owner/login/page.tsx` | Add metadata export with `robots: { index: false }` |

## Files NOT to Modify

- `app/faqs/layout.tsx` / `app/faqs/page.tsx` — content and metadata are correctly player-focused; don't retarget.
- `app/advertise/page.tsx` — already good.
- `public/robots.txt` — already correct.
- `app/info/page.tsx` / `app/info/layout.tsx` structure — already targets operators well; only the Organization schema gets touched.

## Testing

1. `npm run build` succeeds with no errors.
2. Visit `/sitemap.xml` — should list `/info`, `/faqs`, `/advertise` only.
3. View source on `/info` — Organization + WebApplication JSON-LD present, `sameAs`/`contactPoint` added.
4. Confirm `/owner/login` renders a `noindex` meta tag.
5. Validate structured data with Google's Rich Results Test.
6. After Phase 5 content ships, re-validate FAQPage/HowTo schema on the new page only.
