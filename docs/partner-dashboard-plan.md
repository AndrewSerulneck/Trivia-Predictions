# Partner Dashboard + Home/Domain Split — Build Plan

**Status:** Active build plan. This is the canonical, step-by-step reference for turning the current `/owner/*` payments surface into a mobile-first **Partner Dashboard**, migrating billing to **Stripe**, and flipping the site so `/info` is the apex homepage while the player game moves to `play.hightopchallenge.com`.

**Read first:** `SYSTEM_CONTEXT.md` §0 (Strategic Direction) and §9 (Partner/Owner surface current state). This doc is the execution detail behind that direction.

---

## 1. Product vision (what we're building and why)

A **subscriber venue** ("partner") pays for our geofenced platform so their guests can play at their venue. The Partner Dashboard is the mobile-first place a partner does everything from their phone. Three pillars:

1. **Schedule live games** — the whole venue plays together at the same time (Live Trivia, Category Blitz, future live games). Self-serve, scoped to only the partner's own venue(s).
2. **Cast the TV display URL** — put our public "follow-along" venue screen on their TVs so guests who aren't on their phones can watch and get enticed to join. (Screen already exists; native TV apps do not — we're browser-only today.)
3. **Manage billing** — subscribe and pay (migrating from SlimCD → **Stripe** this week), update card, view invoices.

Alongside this, two IA moves happen over the next few weeks:
- **`/info` becomes the apex homepage** (the page Google indexes and new visitors land on).
- **The player game login moves to `play.hightopchallenge.com`** (apex → marketing; `play.` → the game).

---

## 2. Current-state audit (what already exists)

You are **not** starting from zero. Inventory:

| Area | Exists today | Files |
| --- | --- | --- |
| Marketing page | `/info` (721 lines), "Partner Login" button already links to `/owner/login` | `app/info/page.tsx` (buttons at lines ~310, ~337) |
| Apex `/` | Renders the player game login (`JoinFlow`) | `app/page.tsx` |
| Route gate | Host-agnostic path gate; `/info`, `/owner`, `/admin`, `/join`, `/advertise` all handled | `proxy.ts` (middleware, matcher at bottom) |
| Owner auth | Login/register/forgot/reset, logout | `app/owner/{login,register,forgot-password,reset-password}/page.tsx`, `app/api/owner/auth/*` |
| Owner dashboard | Subscription summary + links; redirects to `/owner/billing/setup` if no sub | `app/owner/dashboard/page.tsx` |
| Owner shell | Shared layout + input/button class tokens | `components/owner/OwnerShell.tsx` |
| Auth guard | Owner auth scoped to `venue_owner_venues` | `lib/requireOwnerAuth.ts` |
| Owner→venue model | `venue_owners` + `venue_owner_venues` tables | (see `register`, `requireOwnerAuth`) |
| Billing (SlimCD) | Hosted-payment sessions, return handler, card update, invoices list | `app/api/owner/billing/{route,subscription,session,return,card}.ts`, `lib/slimcd.ts`, `billing_subscriptions` table (has `slimcd_recurring_token`) |
| Billing (deprecated) | Old subscribe endpoint returns 410 | `app/api/owner/billing/subscribe/route.ts` |
| Live-game scheduling | **Admin-only** create/list/delete | `app/api/category-blitz/schedules/{route,[id]}.ts`, `lib/categoryBlitzSchedules.ts`, `lib/categoryBlitzScheduleTime.ts` |
| Sessions | Category Blitz session lifecycle | `app/api/category-blitz/sessions/*`, `lib/categoryBlitzRealtime.ts` |
| TV display screen | Public venue "follow-along" screen + state API | `app/venue/[venueId]/screen/`, `app/api/venue-screen/state/` |
| Admin scheduling | Live Trivia schedules live under Admin → "Challenges & Events" | `app/admin/*` |

**Key gaps to close:**
- Scheduling is admin-gated, not owner-scoped.
- Billing is SlimCD, not Stripe.
- No dashboard "home hub" tying the three pillars together in a mobile-first layout.
- No TV-URL/QR surface for partners.
- Domain split (apex vs `play.`) is not yet enforced.

---

## 3. Sequencing rationale

Order is dependency-driven, and front-loads the two things with deadlines (**Stripe = this week**, **domain flip = a few weeks out**):

1. **Phase 1 — Entry + Dashboard IA/shell** first: it's a quick win, verifies/repairs the "Partner Login" path, and gives every later phase a home to slot into.
2. **Phase 2 — Design pass (Claude Design)** next so the feature phases build to a real mobile-first spec instead of being re-skinned later.
3. **Phase 3 — Stripe migration** (this week's deadline). Billing scaffolding already exists to replace.
4. **Phase 4 — Owner-scoped scheduling** (pillar 1) — the headline feature.
5. **Phase 5 — TV display URL/QR** (pillar 2) — smallest, mostly UI.
6. **Phase 6 — Domain split** (apex→`/info`, game→`play.`) — DNS/edge work, gated behind a flag, shippable when DNS is ready (the "few weeks" item).
7. **Phase 7 — `/info`-as-home SEO & polish.**

Phases 3–5 are independent after Phase 1–2 and can be parallelized across sessions if desired. Phase 6 depends on nothing but DNS and should not block the dashboard work.

### Model guide (per phase)
- **Opus 4.8** — architecture, auth/security boundaries, Stripe + webhooks, host-based middleware. Anything touching money, auth, or `proxy.ts`.
- **Sonnet 5** — well-specified CRUD, API routes, form UI wired to an agreed contract.
- **Haiku 4.5** — trivial edits (copy, link targets, class swaps).
- **Claude Design / Claude.ai Web UI (Opus 4.8)** — visual/IA design deliverables (mockups, component specs). Prompts to paste are included inline.

> On this Claude Code plan, run the in-editor phases with **Opus 4.8** (this model) unless a phase explicitly says a cheaper model is fine.

### Model & effort summary

| Phase | Model | Effort |
| --- | --- | --- |
| 1 — Entry + Dashboard IA/shell | Opus 4.8 (routing/redirect), Sonnet 5 (tile UI) | **S** — half day; mostly wiring + one new hub page |
| 2 — Mobile-first design | Claude Design / Claude.ai Web UI (Opus 4.8) | **S** — one Web UI session + a short distill-back pass |
| 3 — Stripe billing migration | Opus 4.8 only | **L** — multi-day; new SDK, webhook, migration, two rewired flows, real testing against Stripe test mode |
| 4 — Owner-scoped scheduling | Opus 4.8 (API/auth boundary), Sonnet 5 (form UI) | **M** — 1–2 days; new auth-scoped routes + list/create/delete UI, reusing the existing engine |
| 4b — Live Trivia owner scheduling | Opus 4.8 (engine adapter, merged list, cross-game overlap guard), Sonnet 5 (per-game form fields) | **M** — ~1 day; two schedule stores feeding one surface; the overlap guard is the risk spot |
| 5 — TV display URL + QR | Sonnet 5 | **S** — half day; mostly UI, screen/API already exist |
| 5b — TV pairing code ("Link a TV") | Opus 4.8 (migration, pairing APIs, `proxy.ts` public carve-out), Sonnet 5 (TV page + dashboard UI) | **M** — ~1 day; new public route through the live edge gate + an owner-authed claim boundary; treat the `proxy.ts` change as carefully as Phase 6 |
| 6 — Domain split | Opus 4.8 only | **M–L** — the code change is contained (`proxy.ts` + link audit) but blast radius is the whole site's routing; budget time for staged verification, not just implementation |
| 7 — SEO & polish | Sonnet 5 (metadata/markup), Haiku 4.5 (copy) | **S** — half day |
| 8 — Partner welcome email | Sonnet 5 (template + wiring); Opus 4.8 only if webhook de-dupe gets subtle | **S–M** — provider setup + template + one webhook edit |
| 9a — Venue Competitions: ownership + boundary + API | **Opus 4.8 only** — adds a column to the shared challenge engine and an owner CRUD boundary next to admin CRUD on the same table | **M–L** — 1–2 days; the engine reuse is the win, the ownership seam is the risk |
| 9b — Venue Competitions: templates + UI | Sonnet 5 | **M** — ~1 day; template gallery, 3-step create, results list, 4th hub tile |

Effort key: **S** = small/contained, low risk of surprises. **M** = moderate, touches auth or shared state. **L** = large and/or high-stakes (money, edge routing) — do not rush, do not delegate below Opus.

---

## Phase 1 — Partner Dashboard entry + IA shell
**Goal:** The "Partner Login" button reliably lands a partner in a mobile-first dashboard hub with three clearly-labeled destinations (Schedule / Display / Billing), even before those features are fully built. Repair the entry path the user reported as broken.

**Model:** Opus 4.8 (routing/auth-adjacent), or Sonnet 5 for the pure-UI parts. **Effort:** S

**Steps:**
1. **Verify the entry path.** `app/info/page.tsx` "Partner Login" already targets `/owner/login`. Confirm `/owner/login` → `/api/owner/auth/login` → `/owner/dashboard` works end-to-end. The reported "no longer reaches payments" is almost certainly the post-login redirect: `app/owner/dashboard/page.tsx` sends owners with **no** subscription to `/owner/billing/setup`, and owners **with** a sub to the summary. Decide the intended landing (recommended: always land on the new dashboard **hub**, with billing as one tile) and adjust the redirect in `app/owner/dashboard/page.tsx:48-51`.
2. **Build the dashboard hub.** Replace/extend `app/owner/dashboard/page.tsx` so it renders three primary tiles using `OwnerShell` (`maxWidth="lg"`):
   - **Live Games** → `/owner/schedule` (Phase 4)
   - **Venue Display** → `/owner/display` (Phase 5)
   - **Billing & Subscription** → `/owner/billing` (existing; Stripe in Phase 3)
   Each tile shows a one-line status (e.g. "Next game: Fri 8pm", "Subscription active", "Display ready"). Stub the not-yet-built tiles with a "Coming soon" state so the hub ships now.
3. **Reframe copy** to "Partner Dashboard" / "partner" / "your venue" (keep `/owner` routes and table names as-is per SYSTEM_CONTEXT §0). Update `OwnerShell` default title usage where "Owner" is user-visible.
4. **Multi-venue affordance.** `venue_owner_venues` allows >1 venue per owner. Add a venue switcher to the hub header if `auth.venueIds.length > 1` (persist selection in component state / query param). Single-venue owners see no switcher.

**Files:** `app/info/page.tsx`, `app/owner/dashboard/page.tsx`, `components/owner/OwnerShell.tsx`, new `app/owner/schedule/page.tsx` + `app/owner/display/page.tsx` (stubs).

**Done when:** From `/info`, tapping "Partner Login", logging in, and landing on a 3-tile mobile hub works on a phone viewport. Billing tile reaches the existing billing page. `npx tsc --noEmit` and `npm run lint` clean.

---

## Phase 2 — Mobile-first Partner Dashboard design (Claude Design)
**Goal:** A concrete visual + interaction spec for the hub and the three sections, matching our dark-native brand, so Phases 3–5 build to a target instead of guessing.

**Model:** **Claude Design / Claude.ai Web UI (Opus 4.8)** — this is a design deliverable, done outside the codebase. Bring the output back as a spec/mockups. **Effort:** S

**Do this in the Web UI.** Paste the prompt below. Attach or paste, if you can: `design-system/hightop-challenge-design-system/project/colors_and_type.css`, and screenshots of `/info` and the current `/owner/dashboard`.

> **Prompt to paste into Claude Design / Claude.ai:**
>
> You are designing a **mobile-first Partner Dashboard** for "Hightop Challenge," a venue-based social gaming platform for bars. The user is a bar/venue owner ("partner") using their phone. The dashboard has one hub and three sections.
>
> **Brand (must match):** Dark-native only, no light mode. Canvas `#020617`, surface `#0f172a`, elevated `#1e293b`. Headings use **Bree Serif**, body/UI uses **Nunito**. Each section can carry an accent gradient; our game accents are Live Trivia cyan→sky→blue, Category Blitz (choose a complementary accent), billing/neutral indigo. Warm red-orange is reserved for exit/back only. Design for a 390px-wide phone first; degrade gracefully to tablet.
>
> **Hub screen:** venue name + optional venue switcher (owners can have multiple venues), and three large tap targets:
> 1. **Live Games** — schedule games the whole venue plays together (Live Trivia, Category Blitz). Show next scheduled game as a status line.
> 2. **Venue Display** — a URL + QR code the owner opens on their venue TVs so non-playing guests can follow along. Show "Display ready" status.
> 3. **Billing & Subscription** — subscription status, next billing date, update card, invoices.
>
> **Section 1 (Live Games):** a mobile list of upcoming/past scheduled games, a prominent "Schedule a game" button, and a create/edit form (game type, date, time, timezone, title). Include empty state.
>
> **Section 2 (Venue Display):** big QR code, copyable URL, "Open on this TV" instructions for a smart-TV browser, and a preview thumbnail of what guests see.
>
> **Section 3 (Billing):** subscription card (plan, amount/mo, status pill, next billing date), "Update payment method", and an invoice list. This will be powered by Stripe.
>
> **Deliverables:** (a) annotated mobile mockups for the hub + 3 sections + the schedule create form + empty states; (b) a component inventory (cards, status pills, primary/secondary buttons, list rows, QR panel) with the Tailwind-ish tokens/classes to use; (c) interaction notes (loading, error, success toasts). Produce it as a single self-contained HTML artifact I can view on my phone.

**Bring back into the repo:** distill the artifact into a short `docs/partner-dashboard-design.md` (component inventory + screen specs) that Phases 3–5 reference. Keep all real styling in Tailwind + `lib/themeTokens.ts` per the brand-centralization rule — do not hardcode colors.

**Done when:** `docs/partner-dashboard-design.md` exists and the hub from Phase 1 is re-skinned to match.

---

## Phase 3 — Stripe billing migration (THIS WEEK)
**Goal:** Replace the SlimCD hosted-payment flow with Stripe Checkout + Billing for subscribe, update-card, and invoices, without breaking the `billing_subscriptions` data contract the dashboard reads.

**Model:** **Opus 4.8** — money + webhooks + auth. Do not delegate to a cheaper model. **Effort:** L

> ⚠️ **Boundaries:** Never read/modify `.env.local` (add Stripe keys yourself). New DB columns require a **new** migration file following `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md` (creating new migrations is allowed; never edit historical ones). Do not touch `lib/supabaseAdmin.ts` semantics.

**Steps:**
1. **Add the SDK & config.** `npm i stripe`. Create `lib/stripe.ts` (server-only, mirrors the guard style of `lib/supabaseAdmin.ts`) reading `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and a `STRIPE_PRICE_ID` (the $/mo subscription price). You add these to `.env.local` and Vercel envs — the agent must not.
2. **Schema.** New migration adding `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id` to `billing_subscriptions` (keep `slimcd_recurring_token` nullable for back-compat). Follow the secure-migration checklist.
3. **Checkout session.** New `app/api/owner/billing/checkout/route.ts` (owner-auth'd via `requireOwnerAuth`, venue-scoped like `session/route.ts`): creates a Stripe Checkout Session in `subscription` mode for the venue's price, `success_url`/`cancel_url` back to `/owner/billing`, stashing `venueId`/`ownerId` in `metadata`. Return the `url`.
4. **Webhook.** New `app/api/webhooks/stripe/route.ts` (public, signature-verified with `STRIPE_WEBHOOK_SECRET`, `runtime = "nodejs"`, raw body). Handle: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Upsert `billing_subscriptions` (status active/past_due/cancelled, period end) and insert invoice rows. This is the source of truth for status — mirror how the SlimCD `return` handler updated state, but driven by webhook.
5. **Update card / manage.** Add a Stripe Billing Portal session route (`app/api/owner/billing/portal/route.ts`) and point "Update payment method" / "Manage billing" at it. This replaces `card/route.ts`'s SlimCD update-card intent.
6. **Rewire the UI.** In `app/owner/billing/` and `app/owner/billing/setup/`, swap the SlimCD `POST /api/owner/billing/session` calls for the new checkout/portal routes. The dashboard read path (`GET /api/owner/billing`) stays the same shape so `app/owner/dashboard/page.tsx` needs no change.
7. **Decommission SlimCD (staged).** Leave `lib/slimcd.ts` + `session`/`return`/`card` routes in place but stop calling them; add a code comment marking them deprecated pending removal once no active SlimCD subscriptions remain. Do **not** delete `vercel.json` cron entries without instruction.
8. **Test.** Add Vitest coverage for webhook signature verification and the status-mapping logic. Manually verify with Stripe test cards + `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.

**Files:** new `lib/stripe.ts`, `app/api/owner/billing/checkout/route.ts`, `app/api/owner/billing/portal/route.ts`, `app/api/webhooks/stripe/route.ts`, new migration under `supabase/migrations/`, edits in `app/owner/billing/*`.

> **Optional Web UI research prompt (Opus 4.8):** "Give me the minimal correct Stripe Checkout + Billing setup for a single monthly subscription price per customer in a Next.js App Router API route, including the exact webhook events I must handle to keep a `status` (active/past_due/cancelled) and `current_period_end` in sync, and how to verify the webhook signature with the raw body in a Next.js route handler." (Verify against current Stripe docs — see the `claude-api` skill only for Anthropic APIs; Stripe is external.)

**Done when:** A partner can subscribe via Stripe Checkout, the webhook flips `billing_subscriptions.status` to active, the dashboard reflects it, "Update payment method" opens the Stripe portal, and invoices list. Test-mode end-to-end verified.

---

## Phase 4 — Owner-scoped live-game scheduling (Pillar 1)
**Goal:** Partners self-serve scheduling of Live Trivia and Category Blitz for **their own** venue(s) from the dashboard. Reuse the existing scheduling engine; add an owner-auth surface.

**Model:** Opus 4.8 for the API/auth boundary; Sonnet 5 for the form UI once the contract is set. **Effort:** M

**Steps:**
1. **Owner-scoped API.** The current create/list/delete in `app/api/category-blitz/schedules/{route,[id]}.ts` use `requireAdminAuth`. Add owner-scoped access without weakening admin:
   - New `app/api/owner/schedule/route.ts` (GET list / POST create) and `app/api/owner/schedule/[id]/route.ts` (DELETE), each using `requireOwnerAuth` and **enforcing** `venueId ∈ auth.venueIds` (mirror the venue-scope check in `app/api/owner/billing/session/route.ts`). Delegate to the same `lib/categoryBlitzSchedules.ts` + `lib/categoryBlitzScheduleTime.ts` helpers the admin routes use — do not fork the engine.
   - Keep the existing admin routes intact for internal staff.
2. **Generalize beyond Category Blitz.** The schedule engine is Category-Blitz-named. For Live Trivia, confirm where Live Trivia schedules live (Admin → "Challenges & Events") and either (a) add a `gameType` to the owner schedule contract that routes to the right engine, or (b) ship Category Blitz first and add Live Trivia in a fast-follow. Recommended: ship Category Blitz scheduling first, then Live Trivia, behind one `gameType` field so the UI is future-proof for "games that don't exist yet."
3. **Schedule UI.** Build `app/owner/schedule/page.tsx` (from the Phase 2 spec): upcoming/past list, "Schedule a game" CTA, create form (gameType, title, date, time, timezone — reuse `datetimeLocalValueToUtcIso` from `lib/categoryBlitzScheduleTime.ts`), delete with confirm. Empty state included.
4. **Guardrails.** Validate no overlapping schedules for the same venue; surface friendly errors. Respect any existing session/lifecycle constraints in `lib/categoryBlitzRealtime.ts` (e.g. deleting a schedule with a running session → the "abandoned" status added in the recent migration).

**Files:** new `app/api/owner/schedule/route.ts`, `app/api/owner/schedule/[id]/route.ts`, `app/owner/schedule/page.tsx`; reuse `lib/categoryBlitzSchedules.ts`, `lib/categoryBlitzScheduleTime.ts`.

**Done when:** A logged-in partner schedules a Category Blitz game for their venue from their phone, sees it listed, can delete it, and cannot create/see/delete schedules for a venue they don't own (403). `npm run test` covers the venue-scope enforcement.

---

## Phase 4b — Live Trivia owner scheduling (un-gate the second game type)
**Goal:** Partners can schedule **Live Trivia** from the same dashboard form where they schedule Category Blitz. The `gameType` contract from Phase 4 anticipated exactly this — `live_trivia` is already **known** on the wire and rendered (disabled, "Coming soon") in the picker; this phase flips it to **supported** by wiring the second engine.

**Model:** **Opus 4.8** for the engine adapter and cross-game overlap boundary (two schedule stores now feed one surface; getting the merge/guard wrong double-books a venue's night); Sonnet 5 for the form's per-game fields. **Effort:** M

**What already exists (do not fork):** the Live Trivia ("Live Showdown") schedule engine is `lib/liveShowdownAdmin.ts` — `createAdminLiveShowdownSchedule`, `listAdminLiveShowdownSchedules`, `updateAdminLiveShowdownSchedule`, `deleteAdminLiveShowdownSchedule` — backed by the `trivia_schedules` table, with question-matrix seeding (`buildLiveShowdownQuestionMatrix`) built into create/update. Timing/duration logic lives in `lib/liveShowdownEngine.ts` (`LIVE_SHOWDOWN_TIMING`, `enumerateScheduleOccurrences`).

**Steps:**
1. **Adapter in `lib/ownerSchedule.ts`.** Route `gameType: "live_trivia"` to the liveShowdown helpers. The contracts differ: Category Blitz takes `startTimeIso`/`endTimeIso`; Live Trivia takes `targetDate` + `startTime` + `timezone` + `numRounds` (duration derives from rounds via `LIVE_SHOWDOWN_TIMING`). Normalize inside the adapter so the API contract stays one shape (`startTime`, `endTime`, `timezone`, `gameType`, plus an optional `rounds`). Owner-created Live Trivia schedules stay `recurringType: "none"` (one-off), same as Category Blitz — recurring stays admin-only for now.
2. **Flip the support flag.** Move `"live_trivia"` from known-only into `SUPPORTED_OWNER_SCHEDULE_GAME_TYPES` in `lib/ownerSchedule.ts`. `listOwnerSchedules` must now **merge** both stores (`category_blitz_schedules` + `trivia_schedules`, filtered to the venue, tagged with their `gameType`) so the dashboard list shows the venue's whole live-game calendar in one place.
3. **Cross-game overlap guard.** A venue plays one live game at a time. Extend the Phase 4 overlap check to compare a new window against **both** engines' schedules — scheduling Live Trivia at 8pm must 409 if Category Blitz already owns 8pm, and vice versa. Same `OWNER_SCHEDULE_OVERLAP_MESSAGE`, same half-open interval semantics (`rangesOverlap`).
4. **Delete parity.** Owner delete of a Live Trivia schedule delegates to `deleteAdminLiveShowdownSchedule` (after the same `getOwnerSchedule` → `ownsVenue` check); confirm what happens to an in-flight occurrence (mirror the Category Blitz "abandon, don't gracefully end" decision or document why Live Trivia differs).
5. **Form UI.** In `app/owner/schedule/page.tsx`: enable the Live Trivia option in `GAME_TYPE_OPTIONS`, and make the rounds input game-aware — Category Blitz keeps `gameDurationMinutes` (from `lib/categoryBlitzShared.ts`) for its end-time preview; Live Trivia previews duration from its own rounds→minutes math (expose a helper from the adapter; don't guess client-side).
6. **Tests.** Extend `tests/api.owner.schedule.test.ts`: live_trivia create routes to the right engine, cross-game overlap 409s in both directions, merged list tags each row's `gameType` correctly, venue-scope 403s unchanged.

**Files:** `lib/ownerSchedule.ts` (adapter + flag + merge + guard), `app/owner/schedule/page.tsx` (picker + per-game form), `tests/api.owner.schedule.test.ts`; reuses `lib/liveShowdownAdmin.ts` + `lib/liveShowdownEngine.ts` untouched.

**Done when:** A partner schedules a Live Trivia night and a Category Blitz night from the same form, sees both in one list, cannot double-book the same window across game types (409), and the question matrix seeds exactly as it does for admin-created schedules. All gates green.

---

## Phase 5 — Venue TV display URL + QR (Pillar 2)
**Goal:** Give partners a dead-simple way to put our follow-along display on their venue TVs.

**Model:** Sonnet 5 (mostly UI; the screen and its API already exist). **Effort:** S

**Steps:**
1. **Surface the URL.** Build `app/owner/display/page.tsx` showing, per selected venue, the public screen URL (`/venue/[venueId]/screen`) as absolute `https://…` (respect the coming `play.` domain — derive from an env base URL, don't hardcode host).
2. **QR + copy.** Render a QR code for the URL (add a small dependency like `qrcode` generating a data-URI, or an inline SVG QR — no external image hosts). Add a one-tap "Copy URL" and short "Open your TV's browser and go here / scan this" instructions for smart-TV / Firestick browsers.
3. **Preview.** Embed a small live preview (iframe or thumbnail) of `/venue/[venueId]/screen` so the partner sees what guests will see. Confirm the screen route is publicly reachable (per `proxy.ts` `isVenueScreenPath`).
4. **Future note (do not build now):** native Amazon/Google/Apple TV apps don't exist yet; this phase is browser-URL only. Leave a comment/section marker for the future native path.

**Files:** new `app/owner/display/page.tsx`; references `app/venue/[venueId]/screen/`, `app/api/venue-screen/state/`, `proxy.ts` (`isVenueScreenPath`).

**Done when:** A partner opens the Display tile, scans/opens the URL on a TV browser, and the venue screen loads and follows the live game.

> **Amended (2026-07-13):** the QR-first premise doesn't survive contact with reality — TVs can't scan QR codes, and typing a long URL on a TV remote is painful. Phase 5's page stays (the preview + copyable URL are still useful), but once **Phase 5b** ships, the QR/URL panel is demoted to a secondary "Manual setup" section and the pairing-code flow becomes the primary path.

---

## Phase 5b — TV pairing code: "Link a TV" (replaces QR-first setup)
**Goal:** Netflix/YouTube-style TV activation. The owner opens one short, memorable URL on the TV (`hightopchallenge.com/tv`), the TV shows a big 6-character code, and the owner claims that code from the Partner Dashboard on their phone. The TV then redirects itself to the venue's follow-along screen — no URL typing, no QR scanning by a TV.

> **No native app required — and the TV never scans anything.** The direction of scanning is: the TV *displays*, the phone *scans/types*. The only manual step a partner ever does on the TV is typing `hightopchallenge.com/tv` into the TV's built-in web browser **once** (every smart TV / Fire Stick / Roku-with-browser can do this; it's 24 keystrokes on a remote, one time). From then on the TV shows the pairing code, and after first pairing the localStorage token auto-resumes the venue screen on every power cycle. Native Amazon/Google/Apple TV apps would only ever remove that one-time typing step — nice-to-have later, **not** a prerequisite for the system to be usable. As a convenience, the `/tv` page also **renders** a QR code alongside the text code, encoding a claim deep-link (`/owner/display?code=XK49PM`) — the owner points their phone camera at the TV, lands on the claim screen with the code pre-filled, and taps once. Phones scan TVs; never the reverse.

**Model:** **Opus 4.8** for the migration, pairing APIs, and the `proxy.ts` public carve-out (this touches the live edge gate — same care as Phase 6); Sonnet 5 for the TV page and dashboard UI once the contract is set. **Effort:** M

**Steps:**
1. **Schema.** New migration (per `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`): `tv_pairing_codes` — `code` (PK, short unambiguous alphabet, e.g. Crockford base32, 6 chars), `venue_id` (nullable FK, set on claim), `created_at`, `expires_at` (~10 min TTL), `claimed_at`, `consumed_at`. RLS deny-all; every access goes through service-role API routes. **Expiry is lazy** (checked on read/claim; expired rows periodically deleted opportunistically) — no new cron, `vercel.json` stays untouched.
2. **Public TV endpoints.** `POST /api/tv-pair` (mint a code; collision-retry on insert) and `GET /api/tv-pair/[code]` (poll; returns `pending` | `claimed { venueId }` | `expired`). Codes are single-use and short-lived; the poll only ever reveals a venueId whose screen is already public, so exposure is low — but still keep the alphabet unambiguous and the TTL tight, and design the endpoints to be rate-limit-friendly (no enumeration of valid codes).
3. **Owner claim endpoint.** `POST /api/owner/tv-pair/claim` `{ code, venueId }` — `requireOwnerAuth` + `ownsVenue` (mirror the Phase 4 boundary exactly): 403 for a venue the owner doesn't control, 404 for an unknown/expired/already-consumed code. Vitest coverage for both, alongside `tests/api.owner.schedule.test.ts` patterns.
4. **`proxy.ts` carve-out (⚠️ live edge gate).** `/tv` and `/api/tv-pair/*` must be publicly reachable without auth cookies (the TV has none) — add them alongside the existing `isVenueScreenPath` allowance. Per CLAUDE.md this is an explicit, separately-verified change: add cases to `tests/proxy.behavior.test.ts` proving `/tv` passes the gate cookie-less AND that no other route's gating changed.
5. **TV page.** `app/tv/page.tsx` (public): renders the code huge (readable across a room) **plus a QR code encoding the claim deep-link** (`/owner/display?code=…` — reuse `qrcode.react`, already a dependency of the display page), polls the status endpoint, and on claim redirects to `gameUrl('/venue/[venueId]/screen')`. Persist the claimed venueId in the TV browser's localStorage so a power-cycled TV auto-resumes to its screen without re-pairing (with a small "Not your venue? Unlink" escape hatch).
6. **Dashboard UI.** On `app/owner/display/page.tsx`, add a primary **"Link a TV"** section (enter the code the TV is showing → claim → success state), pre-filling the code from a `?code=` query param so the TV's QR deep-link lands ready to claim in one tap. Demote the existing QR/URL panel to a collapsed "Manual setup" secondary. Keep the live preview.
7. **Domain-split awareness.** `/tv` is the URL people type on TVs, so it must work on the **apex** host (short, no subdomain) even after the Phase 6 split: either apex serves the pairing page directly (add `/tv` + `/api/tv-pair/*` to the marketing-host allow-list in `lib/domainSplit.ts`) or apex `/tv` redirects to `play./tv`. Decide once, add it to `tests/lib.domainSplit.test.ts`, and note it in the Phase 6 runbook smoke tests.

**Files:** new migration under `supabase/migrations/`, new `app/api/tv-pair/{route,[code]/route}.ts`, `app/api/owner/tv-pair/claim/route.ts`, `app/tv/page.tsx`; edits to `proxy.ts` (+ `tests/proxy.behavior.test.ts`), `lib/domainSplit.ts` (+ tests), `app/owner/display/page.tsx`.

**Done when:** A TV browser at `/tv` shows a code with no cookies set; the owner claims it from the dashboard on a phone; the TV lands on the venue screen within a few seconds; claiming for an unowned venue 403s; expired/consumed codes are rejected; a power-cycled TV auto-resumes; and the full proxy/domain-split test suites stay green.

---

## Phase 6 — Domain split: apex → `/info`, game → `play.` (a few weeks out)
**Goal:** `hightopchallenge.com` serves the marketing home (`/info` content) and `play.hightopchallenge.com` serves the game. Ship behind a flag so it can go live the moment DNS is ready.

**Model:** **Opus 4.8** — this is `proxy.ts`/middleware and routing; regressions here can break the whole site's gate. Treat carefully. **Effort:** M–L

**Steps:**
1. **Host detection in the edge gate.** In `proxy.ts`, read the request host. Introduce host-based routing gated by an env flag (e.g. `DOMAIN_SPLIT_ENABLED`):
   - Apex/`www` host → serve marketing. Rewrite `/` to the `/info` experience (or make `/info` content render at `/`). Marketing routes (`/info`, `/faqs`, `/advertise`, `/owner/*`, `/api/owner/*`, `/api/webhooks/*`) allowed.
   - `play.` host → serve the game (`JoinFlow` at `/`, `/venue/*`, game APIs). Redirect game routes hit on apex → same path on `play.`, and marketing routes hit on `play.` → apex, so links keep working.
   - Flag **off** → today's single-origin behavior (no change).
2. **Canonical + absolute URLs.** Anywhere we build absolute URLs (display URL in Phase 5, emails, share links, `metadata`), derive host from an env base so the split doesn't produce cross-host links. Audit `app/info/page.tsx` internal links (game CTAs like `/join`, `/` should point at `play.`; marketing anchors stay on apex).
3. **Auth/cookie scope.** Cookies set by `lib/storage.ts` / `lib/serverSession.ts` must work across the game on `play.`. Decide cookie `domain` (`.hightopchallenge.com`) so a session is portable if needed, and re-verify the `proxy.ts` gate + CLAUDE.md "cookies are the only essential layer" contract still holds under the new host.
4. **Config.** Add `play.hightopchallenge.com` to the Vercel project domains (you do this in Vercel; the agent won't). Update `next.config.ts` only if needed for host allowances.
5. **Staged rollout.** Deploy with flag off → verify → set DNS for `play.` → flip flag → smoke-test both hosts (login on `play.`, SEO/marketing on apex, Partner Login from apex still reaches the dashboard).
6. **Phase 5b interaction.** Once the TV pairing flow exists, `/tv` + `/api/tv-pair/*` must remain reachable on the **apex** host under the split (owners type `hightopchallenge.com/tv` into TV browsers). Audit `lib/domainSplit.ts` for this when either phase ships second, and add a `/tv` check to the runbook's smoke tests.

**Files:** `proxy.ts` (primary), `app/page.tsx` / `app/info/page.tsx` (link + render decisions), `lib/storage.ts` + `lib/serverSession.ts` (cookie domain), `next.config.ts`, Vercel domain config (manual).

**Done when:** With the flag on in a preview, apex shows marketing and `play.` shows the game, cross-host links redirect correctly, and a partner can still log in from apex and a player can still log in on `play.`.

---

## Phase 7 — `/info` as home: SEO & polish
**Goal:** Make the marketing home rank and convert.

**Model:** Sonnet 5 (metadata/markup); Haiku 4.5 for copy tweaks. **Effort:** S

**Steps:**
1. **Metadata.** Add Next.js `metadata` (title, description, Open Graph, Twitter card, canonical = apex) to the home route. Add `app/sitemap.ts` and `app/robots.ts`. Ensure the apex canonical points at apex, not `play.`.
2. **Structured data.** Add `Organization` + `LocalBusiness`/`Product` JSON-LD as appropriate.
3. **Performance.** Home must stay fast (recall the venue-page SSR lesson — heavy queries make overlays dismiss and look like redirects). Keep the home page static/marketing-only; no heavy authed queries.
4. **Nav coherence.** Ensure header/footer CTAs route correctly under the domain split (Player Game → `play.`, Partner Login → dashboard).

**Files:** home route metadata, new `app/sitemap.ts`, `app/robots.ts`, `app/info/page.tsx`.

**Done when:** Lighthouse SEO is strong, OG preview renders, sitemap/robots serve, and the home page is fast.

---

## Phase 8 — Partner welcome email (subscription confirmation + feature tour)
**Goal:** When a partner's Stripe subscription activates, send a confirmation email that (a) confirms the subscription so they're not left wondering (Stripe's own receipt email, if enabled, is transactional-only and easy to miss/mistake for spam), and (b) doubles as an onboarding tour explaining what the platform offers, since this is the partner's first real "welcome" moment. Currently **no email is sent by our app anywhere** — this is net-new.

**Model:** Sonnet 5 (templated email + wiring); Opus 4.8 only if the webhook/send-timing logic gets non-trivial (e.g. de-duping resends on `customer.subscription.updated`). **Effort:** S–M

**Steps:**
1. **Pick a sending provider.** None is wired up yet. Resend is the simplest fit for a Next.js app (good deliverability, simple API, React-email templates supported). Add `RESEND_API_KEY` (or chosen provider's key) — operator adds to `.env.local` + Vercel, same boundary as the Stripe keys.
2. **Template.** Build the welcome email content: subscription confirmation (plan, amount, venue name) + a feature tour section covering the three Partner Dashboard pillars (Schedule live games, Venue Display/TV URL, Billing) and the player-facing games (Trivia, Category Blitz, Pick'em, Bingo, Predictions, Fantasy) so partners understand what they're offering guests. Once Phase 5b ships, include a "put it on your TVs" onboarding step pointing at the `/tv` pairing URL — the welcome email is exactly when a new partner is standing in their bar ready to set up screens. Keep it on-brand (dark-native palette translates loosely to email — most clients strip complex CSS, so plan for a simpler light-safe HTML email rather than reusing `lib/themeTokens.ts` directly).
3. **Trigger point.** Send from the Stripe webhook handler (`app/api/webhooks/stripe/route.ts`) on `checkout.session.completed` (first-time activation) — not on every `customer.subscription.updated`, to avoid re-sending on renewals/card updates. Guard against duplicate sends (webhook retries) with an idempotency check, e.g. a `welcome_email_sent_at` column on `billing_subscriptions` or a check against existing invoice rows.
4. **Test.** Verify via `stripe listen` + a real test-mode checkout that exactly one welcome email fires per new subscription, not on renewal/portal updates.

**Files:** new email template (location depends on provider — e.g. `lib/email/welcomeEmail.ts` + a `react-email` component), edit `app/api/webhooks/stripe/route.ts`, possibly a new migration column for idempotency.

**Done when:** A test-mode subscribe flow results in exactly one welcome/confirmation email landing in the partner's inbox, covering both the subscription confirmation and a tour of what the platform offers.

---

## Phase 9 — Venue Competitions: partner-scheduled contests over the async games
**Goal:** Partners can schedule competitions over the **async** games — "most Pick'em points this week," "Prop Bingo night during the Sunday slate," "most Fantasy points tonight" — from the Partner Dashboard, as simply as they schedule a live game. Live games (Phases 4/4b) answer *"what is my venue playing together at 8pm?"*; competitions answer *"who won the week/night?"* across games players already play on their own time.

### 9.0 The key insight: the engine already exists — this is an ownership + templates problem

The **challenge campaigns system** (`lib/challengeCampaigns.ts`, ~1,700 lines, backed by `challenge_campaigns`, `challenge_campaign_progress`, `challenge_cycle_winners`, `challenge_campaign_redemptions`) already does everything the competition mechanics require:

| Requirement | Already in the engine |
| --- | --- |
| Venue scoping | `venue_ids` array on the campaign |
| Per-game scoping | `game_types` filter — `ChallengeGameType` in `types/index.ts:157`: `pickem`, `fantasy`, `speed-trivia`, `live-trivia`, `bingo` |
| "Most points" ranking | `challenge_mode: "leaderboard"` + `buildChallengeLeaderboardSnapshot` + `leaderboardTiebreaker` |
| "Reach N points" goals | `challenge_mode: "progress"` + `pointsRequiredToWin` |
| One night / one week / weekly recurring | `schedule_type`: `one_time` / `multi_day` / `recurring`, with cycle math (`computeCycleStart`/`computeCycleEnd`) |
| Scoring hook | `applyChallengeCampaignPoints` already fires from game scoring paths |
| Winners + prizes | `challenge_cycle_winners`, `pickLeaderboardWinner`, `prizeType`/`prizeGiftCertificateAmount`, and the full redemption flow (`redeemChallengePrize`, `app/api/prizes/redeem-challenge/route.ts`, `components/challenges/ChallengeRedeemPanel.tsx`, `components/prizes/PrizeWalletPanel.tsx`) |
| Player visibility | The player-side challenges panel already renders campaigns; between-cycles it shows the previous cycle's results until the next starts |

What does **not** exist: (a) any notion of *who created* a campaign — they're admin-global today (CRUD via `app/api/challenge-campaigns/route.ts`, admin-gated); and (b) a partner-friendly way to create one — the admin form exposes ~25 fields (image focus, point multipliers, display order…) that a bar owner should never see. So Phase 9 = **an ownership column + an owner-scoped boundary + a template layer that collapses 25 fields into 3 choices.** Do NOT build a parallel competitions engine.

### 9a — Ownership, boundary & API (Opus 4.8 — auth boundary + shared-engine surgery. Effort: M–L)

1. **Migration: campaign ownership.** New migration (per `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`) adding `created_by_owner_id uuid NULL REFERENCES venue_owners(id) ON DELETE SET NULL` to `challenge_campaigns`. Null = admin-created (all existing rows, untouched). Owner-created campaigns carry their creator. `ON DELETE SET NULL`, not CASCADE — a partner closing their account must not vaporize a live competition players are mid-way through; it falls back to admin-managed.
2. **Boundary: `lib/ownerCompetitions.ts`** (mirror `lib/ownerSchedule.ts` exactly — same file shape, same sentinel-message pattern):
   - `ownsAllVenues(auth, venueIds)` — every venue in the campaign must be in `auth.venueIds` (owner campaigns are single-venue in the UI, but enforce the general rule at the boundary).
   - **Template registry** (see 9b) lives here server-side: `createOwnerCompetition` accepts `{ templateId, venueId, title?, startDate, startTime, endDate?, endTime, timezone, prize? }` and *expands the template* into the full `createChallengeCampaign` input — owners never send raw engine fields, so they can never set `pointMultiplier`, `displayOrder`, `imageUrl`, or multi-venue arrays.
   - **Caps & guardrails:** max 3 concurrently-active owner competitions per venue (sentinel → 409); window must be ≥ 1 hour and ≤ 31 days; prize is free-text description or a gift-certificate amount (existing `prizeType` values only). Overlap is *allowed* (unlike live games — two leaderboards can run simultaneously) but same-template-same-window duplicates are rejected.
   - `listOwnerCompetitions(venueId)` — campaigns where `created_by_owner_id = auth.ownerId` AND `venueId ∈ venue_ids`, each with its live leaderboard snapshot via the existing `attachLeaderboardSnapshotsToCampaigns`.
   - `deleteOwnerCompetition(id)` — resolve → verify creator AND venue ownership (404/403 split like the Phase 4 DELETE) → delegate to `deleteChallengeCampaign`. Decide-and-document: deleting mid-cycle voids the cycle (no winner recorded) — surface a confirm warning in the UI.
3. **Routes:** `app/api/owner/competitions/route.ts` (GET list / POST create) and `app/api/owner/competitions/[id]/route.ts` (DELETE) — `requireOwnerAuth`, boundary calls, sentinel→status mapping, exactly like `app/api/owner/schedule/*`.
4. **Player read-path audit.** Verify the player challenges panel and scoring hook (`applyChallengeCampaignPoints`, `isCampaignEligibleAtTime`) treat owner-created rows identically to admin rows (they should — same table, same fields; the audit is confirming no code path filters on "admin-ness"). Also confirm `getChallengeCampaignSnapshotForUser` respects `venue_ids` so a competition at Joe's never shows at Pacific Street.
5. **Tests:** `tests/api.owner.competitions.test.ts` mirroring the Phase 4 suite: 403 unowned venue, 403 not-creator delete, 404 unknown, 409 cap exceeded, template expansion produces exactly the whitelisted engine fields, and admin campaigns are invisible to owner list/delete.

### 9b — Templates & dashboard UI (Sonnet 5 — well-specified once 9a's contract is set. Effort: M)

1. **Template registry** (data in `lib/ownerCompetitions.ts`, rendered by the UI):

   | Template | Engine expansion | Partner sees |
   | --- | --- | --- |
   | **Pick'em Race** | `game_types:["pickem"]`, leaderboard, multi_day (default: this week Mon→Sun in venue TZ) | "Most Pick'em points wins. Runs a full week." |
   | **Prop Bingo Night** | `game_types:["bingo"]`, leaderboard, one_time (default: tonight 6pm→close) | "Big slate tonight? Most Bingo points by close wins." |
   | **Fantasy Night** | `game_types:["fantasy"]`, leaderboard, one_time | "Most Fantasy points tonight wins." |
   | **Trivia Gauntlet** | `game_types:["speed-trivia"]`, leaderboard, multi_day week | "Sharpest trivia brain of the week." |
   | **House Party** | all game types, progress mode, `pointsRequiredToWin` preset tiers | "Everyone who earns N points this week gets the prize." |

   Each template carries: display name, one-line pitch, accent gradient token (reuse the `ht-game-*` tokens from `app/globals.css` / `tailwind.config.ts`), default window shape, boilerplate `rules` text (auto-filled, editable), and the engine expansion. Adding a future template = one registry entry, zero new plumbing.
2. **Create flow — 3 steps, one screen each** (`app/owner/competitions/page.tsx`, `OwnerShell variant="dark"`, patterns from `app/owner/schedule/page.tsx` — venue switcher, exit pill, same input classes):
   - **Pick a template** — card gallery with accent gradients and the one-line pitch.
   - **When** — date/time pickers pre-filled from the template's default window (tonight / this week), timezone select, live "runs Mon 6pm → Sun 11pm" summary line (reuse `datetimeLocalValueToUtcIso` / `utcIsoToDatetimeLocalValue` from `lib/categoryBlitzScheduleTime.ts`).
   - **Prize (optional)** — free-text ("Round of drinks for the table") or gift-certificate amount; plain "no prize, bragging rights" default.
3. **List & results.** Active/upcoming competitions with a live top-3 snapshot (from `attachLeaderboardSnapshotsToCampaigns`); past ones show the recorded winner (`listChallengeCycleWinners`). Cancel = confirm dialog spelling out the mid-cycle-void rule from 9a.
4. **Hub tile.** Add a fourth tile — **Competitions** — to `app/owner/dashboard/page.tsx` (status line: "Pick'em Race ends Sun" / "No competition running"). The Phase 2 design's 3-tile grid extends to 4; follow `docs/partner-dashboard-design.md` tokens.
5. **Verify on mobile** per the `verify` skill patterns: create a Pick'em Race at a test venue, score some Pick'em points as a player, watch the leaderboard move, cancel it, confirm the player panel updates.

**Files:** new migration, `lib/ownerCompetitions.ts`, `app/api/owner/competitions/{route,[id]/route}.ts`, `app/owner/competitions/page.tsx`, `tests/api.owner.competitions.test.ts`; edits to `app/owner/dashboard/page.tsx`; reuses `lib/challengeCampaigns.ts` untouched (plus the one new column).

**Done when:** A partner creates a "Prop Bingo Night" for Sunday in three taps; players at that venue (and only that venue) see it in their challenges panel; points earned in Bingo during the window move the leaderboard; the winner lands in `challenge_cycle_winners` and can redeem through the existing prize flow; the partner cannot see, edit, or delete admin-created campaigns (and vice-versa surfaces stay intact); caps and 403s enforced; all gates green.

---

## 4. Cross-cutting rules (apply in every phase)
- **Never touch:** `.env.local`, historical `supabase/migrations/*` (new files OK), `lib/supabaseAdmin.ts` semantics, `vercel.json` crons — all without explicit instruction.
- **New tables/columns:** follow `supabase/SECURE_TABLE_MIGRATION_CHECKLIST.md`.
- **Auth patterns:** client → `lib/supabase.ts` (RLS); server → `lib/supabaseAdmin.ts` (service role). Owner surface → `lib/requireOwnerAuth.ts`, venue-scoped to `venue_owner_venues`.
- **Types:** hand-maintained in `types/index.ts`; strict TS, no `any`; arrow functions; absolute `@/` imports; Tailwind-only styling via `lib/themeTokens.ts` (no inline styles, no hardcoded brand colors).
- **Naming:** "Partner Dashboard" / "partner" in UI; keep `/owner` + `venue_owner*` in code.
- **Gates before "done":** `npx tsc --noEmit`, `npm run lint`, `npm run test`, and a real mobile-viewport walkthrough (see the `verify` skill for venue-scoped game pages).

## 5. Progress tracker
- [x] Phase 1 — Entry + Dashboard IA/shell *(hub + stubs built and re-skinned to the Phase 2 design)*
- [x] Phase 2 — Mobile-first design (Claude Design) *(spec distilled to `docs/partner-dashboard-design.md`; tokens + hub implemented)*
- [x] Phase 3 — Stripe billing migration — **done & operator-verified (2026-07-13):** test-mode Checkout completed end-to-end. Billing UI is dark-themed (earlier "light-themed" note was stale). The welcome/confirmation email deliberately split out to **Phase 8**.
- [x] Phase 4 — Owner-scoped live-game scheduling — **complete & verified.** API/auth boundary: owner-scoped routes `app/api/owner/schedule/{route,[id]}.ts` + engine boundary `lib/ownerSchedule.ts` (venue-scope enforced via `ownsVenue`, one-off overlap guard, `gameType` contract with Category Blitz supported / Live Trivia known-but-coming-soon), `OwnerSchedule` type, and `tests/api.owner.schedule.test.ts` (14 tests: 403/409/400/401 paths). UI: `app/owner/schedule/page.tsx` (venue switcher, upcoming/past list, "Schedule a game" form with live round-duration → end-time preview, delete-with-confirm, empty state) wired to those routes and the Phase 2 dark design. `npx tsc --noEmit`, `npm run lint`, and full suite (394 tests) all green. *(Recommended before calling it shipped: one real mobile-viewport walkthrough logged in as a partner.)*
- [x] Phase 4b — Live Trivia owner scheduling — **complete & verified.** `live_trivia` flipped to supported in `lib/ownerSchedule.ts` via an adapter over `lib/liveShowdownAdmin.ts` (projects `trivia_schedules` rows onto the `OwnerSchedule` shape; duration derived from rounds via the new client-safe `lib/liveTriviaShared.ts`, drift-guarded against the engine's `ROUND_MS`). `listOwnerSchedules` merges both engines into one venue calendar; `createOwnerSchedule` overlap guard now checks **across both** (no double-booking a window with a different game type); `getOwnerSchedule`/`deleteOwnerSchedule` route by game type. Picker un-gated + per-game duration preview & list pills in `app/owner/schedule/page.tsx`. Tests: `tests/api.owner.schedule.test.ts` now 22 cases (live create routing, cross-game 409 both directions, merged/venue-filtered list, live delete routing + 403) + `tests/lib.liveTriviaShared.test.ts` drift guard. `tsc`, `lint` (0 errors), full suite (405 tests) all green. *(One real partner-login mobile walkthrough recommended, ideally scheduling one of each game type back-to-back.)*
- [x] Phase 5 — Venue TV display URL + QR — **verified (2026-07-13).** `app/owner/display/page.tsx` (QR, copy URL, TV instructions, scaled live preview). Runtime-verified: owner cookie accepted → `/api/owner/venues` returns the venue, 401 without it, `/owner/display` renders (no redirect), and the public `/venue/[id]/screen` route is reachable cookie-less through the edge gate (so QR/URL/preview resolve). `gameUrl` derives the screen URL and is domain-split-aware. Note: two intentional inline `style={{}}` uses (dynamic aspectRatio + transform scale) — a documented exception to the no-inline-style rule. The QR-first UX premise is superseded by Phase 5b, which demotes this to a "Manual setup" secondary.
- [x] Phase 5b — TV pairing code ("Link a TV") — **complete & verified (2026-07-13).** Migration `supabase/migrations/20260713140000_tv_pairing_codes.sql` applied to the DB (operator). Backend: `lib/tvPairing.ts` (mint w/ 23505 collision-retry, `pairingRowStatus` pending/claimed/expired/consumed precedence, single-use consume-on-poll, claim guarded on `venue_id is null`); public `POST /api/tv-pair` + `GET /api/tv-pair/[code]`; owner-authed `POST /api/owner/tv-pair/claim` (venue-scope 403 mirrors Phase 4). Edge gate: minimal `proxy.ts` carve-out (`/tv` only — `/api/tv-pair/*` already public via the blanket `/api/` rule) + `/tv` marked neutral in `lib/domainSplit.ts` so it stays on the apex under the split. UI: `app/tv/page.tsx` (mints a code, shows it huge + grouped "XK4-9PM" plus a QR deep-link to `/owner/display?code=…`, polls every 3s, redirects to `gameUrl('/venue/[id]/screen')` on claim, caches venueId in localStorage for power-cycle auto-resume with a delayed/clickable "not your venue?" escape hatch); "Link a TV" primary section + code input on `app/owner/display/page.tsx` (pre-fills from `?code=`, via new client-safe `lib/tvPairingShared.ts` shared with the server lib), with the old QR/URL flow demoted to a collapsed "Manual setup" panel. Shared code-normalization logic extracted to `lib/tvPairingShared.ts` (mirrors the categoryBlitzShared/liveTriviaShared pattern) so client and server can't drift. Tests: `tests/lib.tvPairing.test.ts` + `tests/api.tv-pair.test.ts` (15 cases: mint/poll/claim, 403/404/409/401) + `/tv` cases in `tests/proxy.behavior.test.ts` + `tests/lib.domainSplit.test.ts`. `tsc` clean, `lint` 0 errors, full suite 424 tests green. **Runtime-verified against the live applied migration** via direct HTTP: mint → pending → claim 401 unauthed → 403 wrong venue → 404 unknown code → 200 claim own venue → poll returns `claimed`+venueId exactly once → re-poll returns `consumed` → re-claim 409 — every boundary and state transition confirmed end-to-end, not just unit-mocked.
- [~] Phase 6 — Domain split (apex → `/info`, game → `play.`) — **code complete, flag off.** Host-based routing lives in `lib/domainSplit.ts` (pure, edge+client-safe) and is layered at the top of **`proxy.ts`** — the live Next.js 16 edge gate (Next 16 renamed the `middleware.ts` convention to `proxy.ts`; it is auto-detected and already runs in production — do **not** add a `middleware.ts`, that's a build error). The split is gated behind `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`; when off it returns `{action:"none"}` and falls through to the existing (live) cookie auth-gate unchanged — fully inert. Game CTAs on `/info`, the venue display URL, and the player session/identity cookies (`lib/storage.ts`, `lib/serverSession.ts`) are all split-aware. Tests: `tests/lib.domainSplit.test.ts` (decision logic) + `tests/proxy.behavior.test.ts` (live proxy behavior: auth-gate + split integration).

> **Correction (2026-07-13):** an earlier "Phase 6a" step wrongly assumed `proxy.ts` was dormant and needed a `middleware.ts` connector + an `EDGE_AUTH_GATE_ENABLED` flag to "safely decouple" the gate. That was based on a misread (Next 16 auto-detects `proxy.ts`; the empty `middleware-manifest.json` was a stale build). Both were reverted — the `middleware.ts` broke the build, and the flag would have disabled a live production auth-gate. The auth-gate remains always-on as in production; the domain split is the only change to `proxy.ts` vs. HEAD.

**Cutover runbook:** the exact, ordered switch-over steps live in **`docs/phase-6-domain-split-runbook.md`** (DNS, envs, cookie domain, smoke tests, instant reversal). Execute that when ready.

**Remaining rollout (operator, all reversible):** set the Phase 6 envs (see `.env.example`) + add `play.hightopchallenge.com` to Vercel domains + set `.hightopchallenge.com` cookie domain; deploy with `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` off → verify in preview → flip on. `next.config.ts` needed no host allowances. The domain split does **not** touch the auth-gate; any future change to that gate is a separate, deliberately-verified decision.
- [~] Phase 8 — Partner welcome email (subscription confirmation + feature tour) — **code complete, needs a Resend key + a real `stripe listen` test to verify.** Provider: Resend (`resend` package added). `lib/email/resend.ts` (null client when `RESEND_API_KEY` unset — no-ops, never throws) + `lib/email/welcomeEmail.ts` (the **editable copy file** — subject, feature-tour cards, player-games list, TV/dashboard CTAs, sign-off are all plain data at the top of the file, HTML/text assembled below) + `lib/email/sendWelcomeEmail.ts` (composes + calls Resend, links via `gameUrl` so `/tv` and `/owner/billing` are domain-split-aware). Wired into `app/api/webhooks/stripe/route.ts` on `checkout.session.completed` only (never on `customer.subscription.updated`, so renewals/card updates don't re-send); idempotency via new `billing_subscriptions.welcome_email_sent_at` column (migration `supabase/migrations/20260713160000_billing_welcome_email_sent_at.sql`) — set only after a successful send, checked before sending. Failures are swallowed so a broken email provider can never fail the webhook or block billing sync. `.env.example` documents `RESEND_API_KEY` + `EMAIL_FROM_ADDRESS`. Tests: `tests/lib.email.welcomeEmail.test.ts` (5 cases — confirmation copy, name fallback, CTA links, full game list, non-empty subject). `tsc` clean, `lint` 0 errors, full suite 446 tests green. **Not yet done:** operator adds `RESEND_API_KEY` (+ a verified sending domain) to `.env.local`/Vercel, applies the migration, and runs a real `stripe listen` + test-mode checkout to confirm exactly one email lands.
- [x] Phase 9 — Venue Competitions — **complete & verified (2026-07-13).** Migration `supabase/migrations/20260713150000_challenge_campaigns_owner_ownership.sql` applied (adds `created_by_owner_id uuid` to `challenge_campaigns`, `ON DELETE SET NULL`, partial index). 9a: engine surgery on `lib/challengeCampaigns.ts` (additive — threaded `created_by_owner_id` through the row type, `mapCampaignRow`, a de-duped `CAMPAIGN_SELECT_COLUMNS` constant, `createChallengeCampaign` input, a `createdByOwnerId` filter on `listChallengeCampaigns`, plus `getChallengeCampaignOwnership(id)`); boundary `lib/ownerCompetitions.ts` + client-safe registry `lib/ownerCompetitionTemplates.ts` (5 templates: Pick'em Race, Prop Bingo Night, Fantasy Night, Trivia Gauntlet, House Party); guards for venue ownership, max-3-active cap (409), 1hr–31day window (400), same-template-same-window duplicate (409), and **venue_ids forced non-empty** (never leaks as a global campaign); routes `app/api/owner/competitions/{route,[id]/route}.ts`. Player-read-path audit came back clean — zero creator/admin filtering in the scoring/eligibility/snapshot functions. 9b: `app/owner/competitions/page.tsx` (venue switcher, template gallery → 3-step create wizard with a "tonight"/"this week" default-window helper computed in the venue's local timezone, active/ended lists with live top-3 leaderboard snapshots and recorded winners, end-with-confirm warning about the mid-cycle-void rule) + a 5th "Competitions" tile on `app/owner/dashboard/page.tsx` (live active-count badge, same pattern as the existing Live Games tile). Tests: `tests/api.owner.competitions.test.ts` (17 cases). `tsc` clean, `lint` 0 errors, full suite **441 tests** green (engine surgery broke no existing challenge tests). **Runtime-verified against the live applied migration**: full create→list→delete cycle via direct HTTP in the exact request shape the UI sends (including gift-certificate and free-text prize threading), plus both new owner pages confirmed reachable (200) through the real auth-gated routes.
- [x] Phase 7 — `/info`-as-home SEO & polish *(metadata/OG/Twitter/JSON-LD already existed on `/info`, `/faqs`, `/advertise`; added `app/sitemap.ts`. Robots policy stays on the pre-existing, deliberate `public/robots.txt` — a dynamic `app/robots.ts` was tried and reverted because Next.js silently prefers the static file, and the static file's site-wide AI-crawler allow-list is an intentional policy that shouldn't be narrowed unilaterally; added a `Sitemap:` line to it instead. Home page (`/info`) is already a static client component — no heavy server queries.)*

---

## Appendix: Venue Access Box Removal — COMPLETED ✅

**Status:** Successfully removed on 2026-07-14. All verification checks passed.

**Goal:** Remove the "Venue Access" tile and detailed section from the Partner Dashboard (`/owner/dashboard`) to save space and simplify the UI. Partners don't need visibility into location check diagnostics.

**Safety Assessment:** This was a **UI-only removal** — no backend APIs, data models, or geofencing functionality was affected. The venue presence system continues to work independently for players.

### What was removed

1. ✅ **Venue Access tile** from the dashboard grid (`tiles` array)
2. ✅ **Venue Access detailed section** at the bottom of the page (`<section id="venue-access">`)
3. ✅ **Associated code cleaned up:**
   - Removed `VenuePresenceDiagnostics` type definition
   - Removed `presenceDiagnostics` state
   - Removed `fetch("/api/owner/venue-presence")` call
   - Removed `selectedPresence` memo

### What stays (no impact — verified)

| Component | Purpose | Status |
|-----------|---------|--------|
| `lib/venuePresenceClient.ts` | Player-side geofencing logic | ✅ Unaffected |
| `components/venue/VenuePresenceBoundary.tsx` | Overlay for out-of-range players | ✅ Unaffected |
| `components/venue/VenueAccessOverlay.tsx` | Visual overlay component | ✅ Unaffected |
| `app/api/owner/venue-presence/route.ts` | API endpoint for diagnostics | ✅ Harmless if uncalled |
| `app/api/venue-presence/*` | Player presence verification APIs | ✅ Core gameplay feature |
| Geofencing logic in `JoinFlow.tsx` | `verifyVenueAccess()` function | ✅ Player join flow |

### Files modified

| File | Changes | Status |
|------|---------|--------|
| `app/owner/dashboard/page.tsx` | Removed Venue Access tile, removed section block, cleaned up state/types | ✅ Complete |

### Verification results

- ✅ TypeScript compiles (`npx tsc --noEmit`) — 0 errors
- ✅ Lint passes (`npm run lint`) — 0 new errors (5 pre-existing warnings in other files)
- ✅ All 4 remaining tiles render correctly (Live Games, Venue Display, Billing, Competitions)
- ✅ Venue switcher still works
- ✅ No broken links
- ✅ Player geofencing unaffected (no code paths modified)

### Post-removal dashboard layout

The dashboard now shows:
1. **Venue switcher** (if multi-venue owner)
2. **"Run your room"** header
3. **4 tiles in grid:**
   - Live Games → `/owner/schedule`
   - Venue Display → `/owner/display`
   - Billing → `/owner/billing`
   - Competitions → `/owner/competitions`
4. **Sign out button**

Clean, simple, focused on partner actions rather than diagnostic data.
