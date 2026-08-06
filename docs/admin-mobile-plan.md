# Admin Mobile Plan

Mobile-first admin surface for the sales team, plus a cleanup of dead and
broken admin sections.

**Slug:** `admin-mobile` · **Run log:** `docs/admin-mobile-run-log.md`

---

## 0. Context & problem

`/admin` renders `components/admin/AdminShell.tsx` — a desktop console: a fixed
240px dark sidebar with 22 sections in 5 groups, an `h-screen` /
`overflow-hidden` frame, and a large `switch` in `renderContent()`.

The users who need mobile are **salespeople activating venues on the road**.
They need a small, task-shaped surface, not the full console reflowed.

Concrete problems on a phone today:

1. **No task-oriented entry.** Landing section is `venue-users`. Activating a
   location means knowing to visit Venues → Partner Billing → Game Settings,
   with no guidance or completion state.
2. **`isMobile` is JS-measured, not CSS.** `useState(false)` plus a resize
   effect means the desktop sidebar renders first on every phone load and then
   swaps. Layout flash, and SSR-wrong.
3. **Horizontal-scroll tables.** `VenuesSection.tsx:461` and `:1346` are
   `overflow-x-auto` `<table>`s whose action buttons live in the rightmost
   column — off-screen on a phone.
4. **The venue form is the bottleneck.** `VenuesSection.tsx:716-957` is ~240
   lines of 2-column grid, ~18 fields, all at equal visual weight, including
   lat/long, county, region and brand colors. Address autocomplete exists at
   `:748` and fills most of them, but that is not obvious.
5. **`h-screen` + `overflow-hidden`.** Mobile Safari's dynamic toolbar makes
   `100vh` wrong and this shell clips. See the `100svh` blackout regression in
   `docs/`-recorded history — this is the same class of bug.
6. **All 22 sections in one client bundle.** `AdminShell` statically imports
   every section (~17k lines) — the whole thing loads before first paint.
7. **Duplicate console.** `components/admin/AdminConsole.tsx` is an older
   second console with its own login form, still reachable via
   `/admin/[section]`. Two auth UIs, two navs.

---

## 1. Decisions (locked)

### 1.1 Desktop / mobile chooser

After admin login, show an interstitial with two buttons: **Desktop** and
**Mobile**. The choice is remembered (localStorage) and overridable — there
must be a visible way to switch modes from inside either shell, so a wrong tap
is never a trap. Deep links to a specific section bypass the chooser.

This replaces the earlier "auto-detect by viewport" idea: the admin, not the
viewport, decides. A salesperson on an iPad may want desktop; a rushed admin
on a laptop may want the mobile flow.

### 1.2 Mobile section allowlist

The mobile shell exposes **exactly three** sections:

- **Venues** (`venue-manage`)
- **Game Settings** (`game-settings`)
- **Partner Billing** (`partner-billing`)

Everything else stays desktop-only and is not reachable from the mobile shell.
This is a hard allowlist, not a default ordering — new sections do not appear
on mobile unless deliberately added.

### 1.3 Section removals

Delete outright:

- **Answer Grader** (`answer-grading`, `TriviaAnswerGraderSection.tsx`)
- **Create Question** (`trivia-create`, `TriviaCreateSection.tsx`)
- **Pick 'Em Settlement** (`pickem-settlement`, `PickEmSettlementSection.tsx`)

Rationale: trivia answer/question authoring belongs in the local JSON files per
`CLAUDE.md`'s Trivia Source of Truth rules, not in an admin form. Pick 'Em
settlement is unnecessary.

Removal must clean up the section id union, `ADMIN_SECTION_OPTIONS`,
`ADMIN_NAV_GROUPS`, `MIGRATED_SECTIONS`, the `AdminShell` switch arms and
imports, and the component files. **API routes are out of scope for deletion**
— `app/api/admin/answer-grading/` and `answer-variants/` may have non-admin
callers; verify before touching, and if in doubt leave them.

### 1.4 Venue form field removals

Remove **Icon Emoji** and **Logo Text** from the venue form
(`VenuesSection.tsx:726` and `:730`). They serve no practical purpose.

This is UI removal. Dropping the DB columns is **not** in scope — other
surfaces (venue screen, venue cards) may still read them, so removing the form
fields must not break a read elsewhere. Check readers before deciding whether
to also stop writing them.

### 1.5 Broken sections — findings

Both "broken" pages were investigated. **Neither is actually broken.**

`UsernameModerationSection.tsx` (172 lines) and `LlmCostSection.tsx` (277
lines) both exist and are fully written, and their APIs are live
(`/api/admin?...` and `/api/admin/llm-cost/`). The "being upgraded… Current
status: Ready" message is `LegacyPanel` — the `default:` arm of `AdminShell`'s
`renderContent()` switch. **Both sections are simply missing a `case` arm.**
They render correctly today at `/admin/username-moderation` and
`/admin/llm-cost` via the old `AdminConsole`, which does have them.

The fix is two `case` arms plus two imports. This is a genuinely small change.

### 1.6 LLM Cost — what it can and cannot show

The user asked whether this page will show spend on (1) Gemini trivia
generation and (2) Haiku grading of Category Blitz answers. Investigated:

- **Tracking infrastructure is real.** `lib/llmCostTracker.ts` writes to
  `llm_usage_log` (migration `20260708140000_llm_usage_logs.sql`) with
  per-model pricing, and `getCostSummary()` aggregates by feature and model.
- **Gemini trivia — partially tracked.** The only Gemini caller is
  `lib/liveTriviaExport.ts:166`, tracked as `live_trivia_rewrite`. That is
  Live Trivia *rewrite*, which may or may not be what "generating trivia
  questions" means to the user. **Open question for the user.**
- **Category Blitz Haiku grading — does not exist.** `scoreRound` in
  `lib/categoryBlitz.ts` contains no LLM call of any kind; a repo-wide search
  for `@anthropic-ai` / `api.anthropic.com` returns exactly one file,
  `lib/usernameModerator.ts`. Category Blitz answers are scored
  deterministically. The `category_blitz_grading` and
  `category_blitz_moderation` values in the `LlmUsageFeature` union are
  **written by nothing** — aspirational enum members.
- **Actually tracked today:** `username_moderation` (Haiku, via
  `lib/usernameModerator.ts:241`) and `live_trivia_rewrite` (Gemini).

**Decision: keep the page, wire it up, and make it honest.** It is two lines of
wiring away from working, and it does show real spend — just not the spend the
user assumed. The page must not imply it covers Category Blitz grading. Do not
delete it; do not fabricate Category Blitz cost data.

---

## 2. Phases

Each phase is one doc: `docs/admin-mobile-phase<N>.md`.

| # | Phase | Model | Effort |
|---|-------|-------|--------|
| 0 | Section removals + venue field removals | Sonnet 5 | medium |
| 1 | Fix the two unwired sections | Sonnet 5 | low |
| 2 | Structural shell fixes | Sonnet 5 | medium |
| 3 | Desktop/Mobile chooser + mobile shell | Sonnet 5 | high |
| 4 | Activate-a-Venue flow | **Opus 5** | **high** |
| 5 | Mobile Game Settings + Partner Billing | Sonnet 5 | high |
| 6 | Device verification | Sonnet 5 | medium |

### Phase 0 — Removals

Delete Answer Grader, Create Question, Pick 'Em Settlement (§1.3). Remove Icon
Emoji and Logo Text from the venue form (§1.4). Verify no other surface breaks
on the removed venue fields before changing write behavior. Pure subtraction —
do this first so later phases work against a smaller surface.

### Phase 1 — Fix the two unwired sections

Add `case "username-moderation":` and `case "llm-cost":` arms plus imports to
`AdminShell.renderContent()` (§1.5). Then make the LLM Cost page honest about
coverage (§1.6): label what is tracked, and do not present untracked features
as zero-cost. Remove the two never-written enum members, or leave them with a
comment — implementer's call, stated in the run log.

### Phase 2 — Structural shell fixes

Replace JS `isMobile` with CSS `md:` breakpoints. Replace `h-screen` / `100vh`
with `min-h-[100svh]`. `next/dynamic` the section components so one section
loads, not 22.

**Caution:** the `svh` change touches the exact CSS pattern behind the earlier
mobile blackout regression. Read that history first; verify in a browser, not
just a build.

### Phase 3 — Chooser + mobile shell

Build the post-login Desktop/Mobile interstitial (§1.1) and the mobile shell
that renders only the three allowlisted sections (§1.2). Establish the mobile
conventions later phases follow: card lists instead of tables, bottom sheets
instead of modals, a persistent mode switch.

### Phase 4 — Activate-a-Venue flow

**The core deliverable, and the only phase that genuinely needs Opus.**

A single guided route. Address autocomplete first — it fills
street/city/state/zip/lat/long in one action — then name and geofence radius,
then everything else collapsed under "Advanced." Single column throughout. No
map picker on the critical path; offer it as an optional "adjust pin" step.
Ends on a success screen showing the venue's TV display URL and a clear next
step into billing.

Design judgment required: what is truly required vs deferrable, and what a
salesperson does when GPS puts the pin in the wrong place.

### Phase 5 — Mobile Game Settings + Partner Billing

Replace the `overflow-x-auto` tables with card lists at mobile widths, keeping
the table at `md:` and up. Each card shows venue name, city, status badge, and
opens a detail sheet holding the actions currently stranded in the right-hand
column. Billing's grant modal (`BillingSection.tsx:619`) becomes a bottom
sheet.

The billing state machine (manual vs Stripe vs force-cancel, and the
`billing_subscriptions` invariant that a row means a partner who *paid*) is
subtle. Preserve its semantics exactly; this is a layout change, not a logic
change.

### Phase 6 — Device verification

Real iPhone and Android pass over the activation flow: address-field keyboard
behavior, safe-area insets, the optional map picker, and one end-to-end
activation against a throwaway venue. Per `CLAUDE.md`, headless browsers
cannot verify this surface — the agent drives Playwright and writes the
checklist, but **sign-off is Andrew's on a real device.**

---

## 3. Constraints all phases follow

- `CLAUDE.md` and `SYSTEM_CONTEXT.md` govern. Read both.
- **No `middleware.ts`.** `proxy.ts` is the live edge gate.
- **The PWA is players-only.** `/admin` stays an ordinary website — no install
  promotion, no service worker, on any admin surface.
- Tailwind utilities only; no custom CSS, no CSS modules, no inline `style={{}}`
  outside the `components/venue-screen/*` exception.
- Strict TypeScript, no `any`, `@/` absolute imports, arrow-function components.
- Do not modify `lib/supabaseAdmin.ts`, `vercel.json`, or existing migrations.
- Deleting a section means deleting its component and every registry
  reference — no orphans left behind.

---

## 4. Open questions for Andrew

1. **"Generating trivia questions with Gemini"** — the only tracked Gemini
   caller is Live Trivia *rewrite* (`lib/liveTriviaExport.ts`). If question
   *generation* happens somewhere else (a local script, a manual process), it
   is not instrumented and will not appear in LLM Cost.
2. **Category Blitz grading is not an LLM.** If the intent is for Haiku to
   grade Category Blitz answers, that is a **feature to build**, not a cost
   page to fix — out of scope here.
3. **Icon Emoji / Logo Text columns** — form fields go in Phase 0. Whether to
   also stop writing or drop the columns depends on remaining readers.
