# Cost projection: 1,000 locations / 100,000 weekly players

Prepared October 30, 2026. USD, before taxes. This is a planning estimate for the current application design, not a provider quote or a load-tested capacity guarantee. No application, cloud configuration, data, or subscription was changed for this analysis.

## Developer summary

Allow approximately **$8,000/month for technology**, with a working range of **$5,000–$12,000/month**. If 1,000 independent locations each pay $100/month by US domestic card through Stripe Billing, allow another **$3,900/month**. A practical combined budget is **$12,000/month ($144,000/year)**; the rounded combined range is **$9,000–$16,000/month**.

The application currently makes frequent server/database requests during Live Trivia. Sharing the repeated work could materially lower these costs, but this estimate does not assume an unbuilt optimization. Different game participation, visit lengths, simultaneous demand, media traffic, and actual subscription contracts can move the result outside the range.

These are projected TOTAL costs, not an exact increase over today's bills. Only Vercel's recent billing-usage report was accessible during this review; Google and Supabase invoices were not obtained.

## Assumptions and boundaries

- Andrew explicitly selected **about once a week** for each of the 100 users per location.
- 1,000 locations × 100 distinct users = 100,000 weekly players. Cross-location duplication would reduce unique people but not their visits.
- 52 / 12 weeks per month = approximately **433,333 player visits/month** or **14,444/day** on a 30-day basis.
- Assumed, not confirmed: approximately **one hour per visit**; half of visits involve active Live Trivia, one quarter Category Blitz, one quarter other games. These are illustrative traffic shares, not observed production engagement.
- Normal image/static-asset delivery, limited transactional emails, no large-scale video advertising or video streaming; no new SMS authentication or marketing-email program.
- Users and games are distributed across operating hours and days. Large simultaneous events need separate performance/capacity measurement; a higher spending limit alone does not establish capacity.
- Existing shared sports feeds and scheduled jobs remain shared. Do not multiply one provider feed or cron schedule by 100,000 players.
- One production Supabase project and a small Vercel development team. Additional staging projects, seats, paid support, backup products, and enterprise contracts are outside the baseline unless explicitly noted below.
- 10% headroom on modeled application requests for retries, reconnects, and imperfect estimates. This is not an allowance for a sustained provider incident or every retry maximum firing on every request.
- Excludes employee/support/engineering labor, advertising acquisition, hardware, merchandise/fulfillment, and venue-funded prize face values.

## Monthly working allowances

| Service | Planning range | Main driver / qualification |
| --- | ---: | --- |
| Vercel | $3,000–$6,000 | Dynamic requests, CPU, memory, CDN requests, origin/data transfer, builds. Current active Live Trivia polling is expensive at scale. |
| Supabase | $1,500–$4,000 | Database compute, API egress, realtime delivery/connections, growing stored history/logs. Instance size needs load testing. |
| Anthropic | $300–$1,200 | Category Blitz answer grading and reverse-mode moderation; usage share and answers requiring judgment vary. |
| Sports data providers | $300–$600 | Working subscription allowance for BallDontLie and any retained API-Sports / TheSportsDB / Odds API plans. Actual accounts/contracts were not audited. |
| Google / Firebase | $0–$100 | FCM push delivery itself is free. Maps and Gemini are separate billable products under Google, depending on use. This allowance assumes primarily partner/admin map activity. |
| Email and image delivery | $0–$150 | Resend and optional Cloudinary, assuming small transactional-email volume and optimized headshots/images. |
| Technology subtotal, exact sum of allowances | **$5,100–$12,050** | Rounded to **$5,000–$12,000**, midpoint approximately $8,000. |
| Stripe, illustrative independent-location case | **$3,900** | $100,000 monthly card receipts × (2.9% Payments + 0.7% Billing) + 1,000 charges × $0.30. |
| Combined, rounded | **$9,000–$16,000** | Working budget **$12,000/month**, approximately $12/location or $0.12/weekly player per month. |

The ranges are engineering allowances, not confidence intervals. Correlated heavy use can increase several lines together. Conversely, fewer live-game minutes can lower several lines together.

## Request and bandwidth model

### Live Trivia

Evidence in the current working tree:

- `app/trivia/live/page.tsx:532`: active gameplay polls `fetchState()` every **1,000 ms**; inactive/final-results states slow to **15,000 ms**.
- `app/api/trivia/live/state/route.ts`: answering, reveal/rest, and mid-game-break responses use `Cache-Control: no-store` while active. The idle cache is not a cache for active gameplay.
- `lib/liveShowdownEngine.ts:2511`, `getLiveShowdownState`: reads schedules, question mapping/content, venue name, viewer results in relevant phases, and standings during breaks. Lazy seeding performs an idempotency count read when triggered; it does not reload the whole question bank on every successful seed check.
- `lib/liveShowdownEngine.ts:2380`, `loadGameLeaderboard`: reads the game's answer records and usernames and aggregates standings separately for each requesting player. It returns only ten displayed entries but the upstream work can include substantially more rows. Do not assume a ten-entry response means only ten database records were transferred.
- Each round lasts 27.5 minutes: 15 questions × 75 seconds plus an 8.75-minute break. The final-results portion polls more slowly, so using a full hour at 1 Hz is a conservative active-minute envelope, not an exact count for every one-hour visit.

Illustrative baseline envelope:

```text
433,333 visits/month × 50% Live Trivia × 3,600 seconds
    = 780,000,000 state requests/month
+ 60,000,000 allowance for other gameplay, hub/background requests and TV
    = 840,000,000 requests/month
× 1.10 retry/reconnect margin
    = 924,000,000 requests/month (~30.8 million/day)
```

The 60-million allowance is not a measured request total. For context, one TV per location open 12 hours/day at the idle 20-second cadence would make about **64.8 million requests/month** before CDN caching; running TVs only around games would be much lower. Active TV states poll faster. `lib/venueScreenTiming.ts` defines 1/4-second active and 20-second idle cadences, and `app/api/venue-screen/state/route.ts` caches idle state for 15 seconds. The legacy `/tv` pairing page has a separate 3-second loop; the venue display itself uses the adaptive cadence. An all-day-TV operating model needs a larger allowance.

At the example US Vercel rates retrieved for this review:

```text
924 million function invocations × $0.60/million       ≈ $554
924 million CDN requests × $2.00/million              ≈ $1,848
924 million × assumed 50 ms active CPU / 3,600 × $0.128 ≈ $1,643
```

These three illustrative items total about **$4,046/month**, before transfer, memory, builds, credits, additional middleware execution where charged, and traffic/cadence variation. **50 ms CPU is an assumption, not an endpoint benchmark.** Requests passing through the Next proxy can add execution; verify the actual billed unit totals rather than assuming one request always means exactly one metered invocation.

Vercel Fluid provisioned memory is billed per running instance and shared across concurrent requests on that instance. Do not charge a separate full 2 GB allocation to every concurrent request. The memory allowance is uncertain until concurrency and instance lifetimes are measured. The existing long-running sports-sync cron adds some fixed memory cost that should not be multiplied per player.

Vercel's Flat Rate CDN tiers retrieved October 30 top out at **150 million monthly requests for $300**; sustained use beyond the highest tier transitions to on-demand pricing. The modeled 924 million requests therefore cannot be priced as unlimited $300/month delivery. Current account eligibility, enabled billing model, discounts, and future contracts must be checked before purchase.

Bandwidth sensitivity:

- At **2 KB per compressed client response**, 924 million responses represent about **1.85 TB/month**, before headers, incoming traffic, initial assets, or images. This is a modeling assumption; exact wire sizes were not measured.
- At **10–30 KB aggregate Supabase outbound data per modeled application request**, the implied API traffic is **9.24–27.72 TB/month**. This allows for frequent small requests plus much larger answer-record reads during standings phases. These are assumed blended billed-byte equivalents, not captured production payloads; HTTP compression and Supabase's metering must be checked against actual reports.
- Supabase at 250 GB included and $0.09/GB gives approximately **$809–$2,472/month** for that egress envelope alone. Database compute and realtime are additional. Avoid treating browser-visible payload size as the amount read from Supabase.

Supabase Pro has unlimited API requests, but this does **not** mean unlimited database capacity or egress. Public compute examples: Pro $25 + 2XL $410 − $10 credit = **$425/month**; Pro + 4XL $960 − $10 = **$975/month**, before usage/add-ons. These are examples for the allowance, not a determination that either size will support the projected peaks. A higher tier or a query/data-flow redesign could be necessary.

Supabase Pro's **100,000 included Auth MAU** is not a $325 bill for the first 100,000 people. It also is not a count of every row in the application's `users` table: actual Auth identities/sessions, including anonymous sessions and multiple devices, determine that meter. Partner identities and extra device sessions can put usage above the nominal player count.

### Category Blitz AI model

`lib/categoryBlitz.ts` uses `claude-haiku-4-5-20251001`, with up to 30 answers per request. Standard mode sends unique, letter-correct answers for validity checks; reverse mode deduplicates eligible moderation items. The application retry loop allows up to three attempts per chunk; the SDK can also retry some failures. Do not assume one API call per answer or that every submitted answer is billed to the grader.

Illustrative monthly workload:

```text
433,333 visits × 25% Category Blitz × 10 rounds × 12 categories
    = 13,000,000 submitted answer opportunities
× 50% assumed sent to grading/moderation
    = 6,500,000 judged items
```

Using assumed 25 input tokens/item plus 400 prompt tokens per 30-item batch and 18 output tokens/item, at official Haiku 4.5 **$1/million input and $5/million output tokens**, yields approximately **$834/month before retry margin**. Batching, duplicates, blank answers, participation and response length change this substantially; a roughly $300–$1,200 allowance is appropriate for the illustrative mix. If everyone played ten rounds weekly and half their answers required AI, the same formula would be about **$3,337/month before retries**. The budget is not a hard cap.

**Accounting trap:** `lib/llmCostTracker.ts` currently estimates Haiku 4.5 using **$0.80/$4.00 per million**, whereas the official current pricing page says **$1/$5**. Its displayed estimate is therefore **20% below list-price token charges** (equivalently, multiply the displayed token estimate by 1.25), assuming those public rates apply to the account. Tracking also occurs after successful parsing; failed/aborted paid requests may not appear. No tracker changes were made.

### Scheduled work and provider subscriptions

`vercel.json` has seven every-minute jobs, one every-five-minute job, one every-fifteen-minute job, one hourly job, and five daily jobs. That is about **314,790 scheduled invocations per 30 days**, before provider webhooks or work inside jobs. Scheduling counts are shared; queries, board grading, recipient delivery, and per-venue work inside those invocations can grow with usage.

The prior continuous Category Blitz empty-round problem was fixed: `runContinuousCategoryBlitzEngine` now only scores expired rounds and does not start empty rounds forever. Older October 14 database-growth measurements in the plan are historical, not the current growth rate.

The existing Speed Trivia scheduled generation cap is **$0.50/run**, at most **$15/30 scheduled runs**, with separate manual operations additional; it is not $15 per venue. Gemini also appears in Live Trivia question tooling, which does not have the same proven shared dollar ceiling in this analysis. Content-generation volume and manually initiated paid operations need their own allowance.

## Other suppliers found

- **Firebase Cloud Messaging:** native push transport; no per-message FCM fee. Sending still consumes our server/database resources.
- **Google Maps Platform:** Places autocomplete/details and partner/admin mapping. Player proximity checks use device/browser geolocation; do not price every player visit as a paid Google Maps load. Dynamic Maps currently has a 10,000-event free monthly cap, then $7/1,000 in the first paid band; if a dynamic map were instead shown on all 433,333 visits, progressive bands would yield approximately **$2,497/month for Dynamic Maps alone**. That is outside this forecast's map assumption.
- **Gemini API:** question generation/rewrite/audit tooling; may appear on a Google bill. Firebase push use does not establish what the existing Google invoice is charging for.
- **Anthropic:** Category Blitz AI; additional discretionary category-generation/editorial tools are not usage-proportional gameplay costs.
- **BallDontLie:** official ALL-ACCESS list price **$299.99/month** for all sports/endpoints. API-Sports, TheSportsDB and The Odds API are also integrated/configurable; key names exist locally, but that does not establish paid subscriptions or current production use. Provider limits and any negotiated commercial package were not audited. A new sports-data contract could exceed the working allowance.
- **Resend:** transactional partner/contact/venue emails. Public free allowance is 3,000 emails/month and paid Pro is $20/month for 50,000; growth in registered players alone does not imply emailing every player.
- **Cloudinary:** configurable headshot/image transformations and delivery, including persisted URLs produced by sync scripts. Free allowance 25 monthly credits; public monthly paid Plus is $99. Credit use combines delivery/storage/transformations, so actual use must be measured. Heavy image/media traffic can exceed the combined email/image allowance.
- **Stripe:** processing and subscription Billing fees, separate from infrastructure. $3,900 assumes 1,000 independent $100 subscriptions paid monthly by US domestic card at public rates. Chain discounts, combined bills, check/ACH payments, negotiated rates, taxes/Tax product fees, international cards, refunds/disputes and annual billing change it. The revenue bands live in `lib/venuePricing.ts`; $100,000 MRR must not be assumed for an arbitrary mix of chains and discounts.
- **Apple/Google app-store developer accounts and domain renewal:** Apple Developer $99/year, Google Play $25 one time, domain renewal at registrar-specific rates. Small fixed overheads, not 100,000-user usage charges. Development tools/CI seats are separate optional overhead and were not audited.

## Observed current baseline and verification limits

Read-only command:

```sh
vercel usage --from 2026-09-30 --to 2026-10-29 --json --non-interactive
```

Reported interval: **2026-09-30T07:00:00Z through 2026-10-30T07:00:00Z**, team context `andrewserulnecks-projects`:

| Meter | Effective cost | Billed cost reported |
| --- | ---: | ---: |
| Build CPU Minutes | $44.7300 | $34.0200 |
| Fluid Provisioned Memory | $16.2818 | $8.7367 |
| Pro | $19.8495 | $5.5740 |
| Fluid Active CPU | $2.4445 | $1.3407 |
| Function Invocations | $0.8634 | $0.4765 |
| Other nonzero meters combined | ~$0.1311 | ~$0.0735 |
| **Total** | **$84.3002** | **$50.2215** |

This is a custom-date usage report, **not a reconciled invoice**, and is team-wide rather than a separately attributed application invoice. Credits/adjustments produce the difference between effective and billed values. Current builds form much of the cost and do not scale directly with venue count. Do not multiply the entire current bill by a user growth ratio.

No Google/Supabase/Anthropic/sports-provider/Resend/Cloudinary invoices or usage exports were retrieved. No user records were exported; no load test, paid AI audit, provider test calls, migration, deployment, subscription change or configuration change was run. Existing unrelated dirty working-tree changes were preserved. Source inspected at HEAD `7aacf153cd8707b6d3f3644051a96614703ecaba` plus the existing uncommitted working tree; exact production parity was not independently verified.

The next measurement that would narrow the estimate is a provider-usage breakdown for an actual attended Live Trivia night: active player-minutes, state requests, average/p95 CPU and response sizes, Supabase billed egress, query counts/latency, and realtime fan-out. This would test the 50 ms CPU and 10–30 KB database-byte assumptions. A 1,000-location simultaneous event also needs a separate peak-load test. Neither was performed as part of this projection.

## Price sources retrieved October 30, 2026

- [Vercel pricing](https://vercel.com/pricing), [Fluid compute regional prices and concurrent memory accounting](https://vercel.com/docs/functions/usage-and-pricing), [CDN on-demand prices](https://vercel.com/docs/manage-cdn-usage), [Flat Rate CDN tiers](https://vercel.com/docs/pricing/flat-rate-cdn).
- [Supabase plan, compute, egress, realtime and Auth prices](https://supabase.com/pricing).
- [Firebase pricing: Cloud Messaging no-cost](https://firebase.google.com/pricing).
- [Google Maps SKU prices](https://developers.google.com/maps/billing-and-pricing/pricing).
- [Claude platform pricing: Haiku 4.5](https://platform.claude.com/docs/en/about-claude/pricing).
- [BallDontLie NFL docs: ALL-ACCESS pricing](https://nfl.balldontlie.io/), [API-Sports](https://api-sports.io/), [The Odds API plans](https://the-odds-api.com/).
- [Resend pricing](https://resend.com/pricing), [Cloudinary pricing](https://cloudinary.com/pricing).
- [Stripe Payments prices](https://stripe.com/pricing), [Stripe Billing prices](https://stripe.com/billing/pricing).
- [Apple Developer annual membership](https://developer.apple.com/programs/enroll/), [Google Play registration fee](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en).
