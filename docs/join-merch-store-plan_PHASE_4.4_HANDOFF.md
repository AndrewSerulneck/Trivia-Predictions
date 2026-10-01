# Join Merch Store — Phase 4.4 Handoff

## For Andrew (plain English)

Phase 4.4 is finished, on your computer only: **nothing is committed, pushed or deployed.**

What changed:
- **The white store panel no longer fights the app's dark-theme styling (F7).** The app has
  site-wide styling that gives every button and text box a dark-theme border and a cyan focus outline.
  On the white store, earlier phases had to override it item by item with "force" markers (`!`). If a
  future control missed one, it would quietly look wrong. Now the white panel is marked as a "light
  surface", and those site-wide rules skip anything inside it. All the force markers in the store are
  gone, and a test fails if anyone adds one back.
- **One visible improvement:** on the Review screen, the **"Back to store"** button now has its
  outline. Before, the dark-theme styling made its border white-on-white, so it looked like loose
  text next to the purple button. Small shape changes too: the store's buttons and boxes now use their
  own rounded corners (the same 12px on a desktop-sized screen, a hair smaller on a phone), and the
  "Review order" button is 2px shorter on a phone.
- **Nothing outside the store changed.** I took screenshots before and after of the Schedule and
  Rewards panels, the dashboard, the partner sign-in, the admin sign-in, the player join screen and
  the /info page. They are pixel-for-pixel identical.

Checked: typecheck, lint, full tests (2,929 pass, 0 fail), production build, and a real-browser
before/after comparison. Not checked on a real phone yet (that's Phase 4.6's checklist).

Needs from you: nothing.

---

## For the next agent (Phase 4.5)

Read `docs/join-merch-store-plan.md` §5 "Phase 4.5" first (findings **F8, F9, F10**). Earlier
handoffs: `docs/join-merch-store-plan_PHASE_1_HANDOFF.md` … `_PHASE_4.3_HANDOFF.md`. The Phase 3
handoff's "Facts and traps" still apply, **except trap 1** (global form CSS needing `!` utilities on
the light panel), which this phase resolved (see §3 below).

### 1. Next phase's goal and scope

**Phase 4.5 (Sonnet 5.5, medium): small cleanups.**
- **F8:** keep `STORE_PAPER_HEX` (`lib/themeTokens.ts:271`, value `"#fefefe"`) and add a test that it
  equals `--ht-store-paper` parsed from `app/globals.css` (line 21: `--ht-store-paper:     #fefefe;`
  — note the run of spaces; parse with a regex, compare case-insensitively). Remove
  `export { getMerchProduct };` (`lib/merchPricing.ts:137`; it still imports `getMerchProduct` at
  line 9 for its own use — keep that import). **Keep `isValidPack`** (Phase 5 needs it).
- **F9:** `git mv public/store/*.png assets/store-src/` (the 4 PNGs are **staged**, so `git mv`
  works). In `scripts/optimize-store-images.cjs`, `SRC` is line 15 and **`OUT = join(SRC, "web")`
  (line 16) is derived from `SRC`** — moving `SRC` without rewriting `OUT` to
  `join(process.cwd(), "public", "store", "web")` would write the WebPs into `assets/`. Update the
  header comment (lines 3–4). Grep for `public/store/*.png`, `public/store/<name>.png` and
  `/store/<name>.png` in docs and tests first (plan §1 table and §2 table name the PNGs; the Phase 1
  handoff does too) and update them. Re-run `npm run store:images`, then `git diff --stat
  public/store/web/` — ideally byte-identical; at minimum the script's corner check must pass.
  `tests/lib.merch-pricing.test.ts` checks every catalog image exists on disk (the WebPs) — it should
  be unaffected.
- **F10:** drop `aria-live="polite"` from the two per-card price lines in
  `components/owner/store/MerchProductCard.tsx` (lines 69 and 101); keep the order bar's single live
  region (`MerchOrderBar.tsx:30`). Check `tests/components.owner-merch-store.test.ts` for any
  assertion on the attribute.

**Out of scope:** the device checklist / docs as-built / commit (4.6), any API route, table,
migration, Stripe, feature flag, `fetch(` under `components/owner/store/`, product wording
(decisions 8 and 10), the contact line (decision 9), the "6 × $4" line (decision 11), and anything in
`app/globals.css` beyond reading the token for F8.

### 2. Starting state

- Branch `main`, HEAD `75563ec10b743da4f739562cf837f30bc1d43938` ("Partner Dashboard Revamp").
  **No commits from Phases 1–4.4.** The 4 source PNGs and 4 WebPs under `public/store/` are staged;
  everything else is unstaged or untracked. No push, deploy, Vercel env change, database read/write
  or migration in any phase.
- Pre-existing unrelated edits from before this plan: `AGENTS.md`, `SYSTEM_CONTEXT.md`,
  `docs/nfl-pickem-reward-phase3.md`, parts of `CLAUDE.md`. Don't revert them; Phase 4.6 asks Andrew
  before committing them together. Phase 4.3 also made reward-wizard changes outside this plan
  (`lib/rewardDefinitions.ts` `gameName`, `CreateRewardWizard.tsx`, their tests) — see the 4.3 handoff.
- Never `git checkout -- <file>` or `git stash` here (user memory: it destroyed work before). To undo
  your own edit, edit it back or restore from a scratchpad copy.
- No server or background process is running (port 3123 was used and stopped). No temp files in the
  repo; screenshots and the CSS diff are in this session's scratchpad only (not needed further).

### 3. Decisions made in Phase 4.4 (don't re-ask)

- **The preferred fix landed, not the fallback.** The light `OwnerSheet` panel's class list starts
  `ht-light-surface …` (`TONE.light.panel`). In `app/globals.css`, four top-level rules gained
  `:where(:not(.ht-light-surface *))` on every selector:
  1. `button:not(:disabled)`, `a[role="button"]` (white/12% border, 12px radius, weight 600,
     line-height 1.2, `transition-all`);
  2. `.tp-clean-button` (`!important` white/12% border, no shadow, 10px radius) — **added beyond F7's
     text**: it is a class every `StepBackButton`/`NextButton` carries, and its `!important` border
     made the light StepBack ("Back to store") borderless on the white panel;
  3. `input`, `select`, `textarea` (`#334155 !important` border, 12px radius, weight 600);
  4. `input:focus`, `select:focus`, `textarea:focus` (cyan `!important` border + glow).
  A comment block above rule 1 explains the scope; each scoped rule is tagged
  `/* light-surface scoped */`.
- **Deliberately NOT scoped** (they suit the light panel too): `button:not(:disabled):active` (press
  nudge), `.tp-clean-button:active`, the small-phone `min-height: 36px !important` media rule, the
  ≤380px button padding rule, the coarse-pointer `font-size: 16px !important` (stops iOS zoom),
  placeholder colours, and the `.admin-console` / `.tp-admin-theme` / `.tp-page-main` rules (their
  ancestor classes never wrap the portalled sheet). The contract test pins the `:active` rule as
  unscoped.
- **The light title keeps `ht-h2 !text-slate-900`.** `.ht-h2` is a typography class, not form CSS;
  it is unlayered and declared after `@tailwind utilities`, so only `!` beats its colour. It lives in
  the primitive only and can't trap a future control. Commented at `TONE.light.title`.
- **The light Close keeps the look it shipped with (12px radius, weight 600).** Its shared class
  string says `rounded-lg … font-black`, but the global button rule made every Close render 12px/600.
  With that rule gone on the light panel, two new `ToneClasses` fields `closeRadius` / `closeWeight`
  hold `rounded-lg`/`font-black` (dark — so the dark className is **byte-identical**, snapshots
  pass without `-u`) and `rounded-xl`/`font-semibold` (light).
- **Accepted visible changes inside the store only** (measured in Chromium at 390×844, root font 14px):
  radii come from `rounded-xl` (10.5px on the phone root font, 12px at a 16px root) instead of the
  global 12px; "Review order" lost the faint white/12% border and is 144×42 (was 146×44);
  "Back to store" gains its slate-300 border + `shadow-sm` and renders at weight 900 (its own
  `font-black`, matching the "Ordering opens soon" button beside it), 135×41 (was 129×38); the
  disabled "Ordering opens soon" lost its invisible white border (208 wide, was 213). Focus on the
  stepper field and pack select is indigo (their own `focus:border-indigo-500` + ring), as before.

### 4. Files changed in Phase 4.4

| File | What |
|---|---|
| `app/globals.css` | Comment block "LIGHT SURFACES OPT OUT…" + `:where(:not(.ht-light-surface *))` on the four rules in §3 (around lines 1019–1100). Nothing else. |
| `components/owner/sheet/OwnerSheet.tsx` | Header comment (light tone paragraph) explains `ht-light-surface`; `ToneClasses` gains `closeRadius`, `closeWeight`; `TONE.light.panel` gets `ht-light-surface`; `TONE.light.closeSurface` `!border-slate-300` → `border-slate-300`; Close className template uses the two new fields. |
| `components/owner/store/QuantityStepper.tsx` | `!border-slate-300` → `border-slate-300` (buttons + field), `focus:!border-indigo-500` → `focus:border-indigo-500`; comment updated. |
| `components/owner/store/CoasterPackSelect.tsx` | `!border-indigo-300` / `!border-slate-300` / `focus:!border-indigo-500` → plain; comment updated. |
| `components/owner/store/MerchOrderBar.tsx` | `!font-black` → `font-black`; comment updated. |
| `tests/light-surface-css-contract.test.ts` | **New.** Parses top-level rules of `app/globals.css` (comments stripped, @-blocks skipped, paren-aware selector split). (1) No unscoped bare form selector (`button…`, `input…`, `select…`, `textarea…`, `a[role="button"]…`, `.tp-clean-button…`) may set `border*` or `font-weight`; (2) the nine scoped selectors exist verbatim; (3) the `:active` / 16px rules stay unscoped. |
| `tests/components.owner-merch-store.test.ts` | New source rule: no `!`-prefixed utility anywhere under `components/owner/store/` (regex `/(^\|[\s"'`:])![a-z][\w-]*-/m`). |
| `tests/components.owner-sheet.test.ts` | Light-tone test: panel has `ht-light-surface`; Close has plain `border-slate-300`, no `!`, and `rounded-xl` + `font-semibold`. Dark snapshots unchanged (they would fail if `ht-light-surface` leaked into dark). |
| `CLAUDE.md` | Join Merch section: phases through 4.4 built; new bullet on `ht-light-surface` and "never add `!` utilities there". |
| `docs/join-merch-store-plan.md` | Status line → this handoff, next 4.5; Phase 4.4 marked DONE with an as-built note; §8 heading "as of Phase 4.4". |

### 5. Facts and traps found in Phase 4.4

1. **`ht-light-surface` is a marker class with no CSS of its own.** It only appears inside the
   `:not()` of the scoped rules. Tailwind doesn't need to know it. Any future light panel/card that
   wants the same opt-out just adds the class to its root — but **only** on a surface whose controls
   all carry their own border/radius/weight classes (a bare `<button>` inside will render with
   Tailwind preflight's no-border look).
2. **Browser support:** `:where()` and complex selectors in `:not()` need Safari 14+ / Chrome 88+ /
   Firefox 84+. An older browser would drop the four rules entirely (dark-app buttons would lose
   their border/weight there). Judged acceptable (iOS 14 is 2020); note it if Andrew reports an old
   device looking odd.
3. **The minifier keeps the selectors verbatim** (`a[role=button]:where(:not(.ht-light-surface *))`)
   and no longer merges `.admin-select-bordered` into the input rule — harmless, same declarations,
   same order.
4. **Light `StepBackButton`/`NextButton` on OTHER light surfaces (admin white cards, `/owner` auth
   and billing cards) still have the `.tp-clean-button` invisible-border problem**, because those
   surfaces are not `ht-light-surface`. Pre-existing, out of this plan's scope. Worth a one-line
   mention to Andrew in 4.6 as a possible follow-up; don't fix it unasked.
5. **On a 390px-wide phone the root font is 14px**, so `h-11` stepper buttons are 38.5px, not 44px,
   and the small-phone rule `min-height: 36px !important` overrides `min-h-[44px]` on buttons.
   Pre-existing, app-wide, not touched.
6. **Screenshot recipe used** (not in the repo): `npm run build`, `npx next start -p 3123`,
   Playwright (`NODE_PATH=$PWD/node_modules node script.cjs`) with `page.route("**/api/owner/**")`
   → `/api/owner/venues` returns `{ ok: true, venues: [{ id: "v1", name: "The Hightop Tavern",
   display_name: "The Hightop Tavern" }] }`, everything else `{ ok: true }`; viewport 390×844 at
   DPR 2, `reducedMotion: "reduce"`. Pages compared: `/owner/dashboard`, `?sheet=schedule`,
   `?sheet=rewards`, `/owner/login` (email field focused), `/admin`, `/`, `/info`. Compared with
   sharp raw-pixel equality: **0 differing pixels on all seven.** The store's shots differ as
   expected (§3).
7. The Phase 3 trap about `npm run build | tail` and `PIPESTATUS` still applies: redirect to a file
   and check `$?`.

### 6. Build, run and test

Sequential (never typecheck concurrently with build):
```
npx tsc --noEmit
npm run lint
npm run test
npm run build > build.log 2>&1; echo $?
```
Targeted:
```
npx vitest run tests/light-surface-css-contract.test.ts tests/components.owner-sheet.test.ts \
  tests/components.owner-merch-store.test.ts tests/lib.merch-pricing.test.ts \
  tests/owner-dashboard-contract.test.ts tests/navigation-controls-contract.test.ts
```

Verified 2026-10-01, end of Phase 4.4:
- `npx tsc --noEmit`: clean. `npm run lint`: clean (the usual Babel `lib/sportsBingo.ts` note).
- `npm run test`: **2,929 passed, 13 skipped, 0 failed** (274 files; +4 tests vs 4.3's 2,925).
- `npm run build`: exit 0; `/owner/dashboard` still `○ (Static)`.
- **Compiled CSS diff** (`.next/static/css/*.css` before vs after, split on `}`): only the four
  scoped rules changed, plus the now-unused `.\!border-indigo-300`, `.\!border-slate-300`,
  `.\!font-black` and `.focus\:\!border-indigo-500` utilities disappeared (nothing else used them).
- **Mutation checks:** removing the scope from `select` fails both CSS-contract assertions;
  re-adding `!font-black` to `MerchOrderBar.tsx` fails the store's no-`!` rule. Both files were
  restored from scratchpad copies and `diff`-checked identical.

**Not verified:** a real phone (iOS select wheel, focus states with a real keyboard, Safari's
rendering of the scoped selectors), VoiceOver, and the other light surfaces in §5 trap 4. Phase 4.6's
device checklist should add: on Review, "Back to store" shows a grey outline; the stepper field and
pack select show an indigo (not cyan) outline when focused.

### 7. Open questions for Andrew

None.

### 8. Recommended first steps for Phase 4.5

1. Run the targeted tests and the four checks to confirm §6.
2. F8 (test + drop the re-export), F10 (two attributes), then F9 (the file move — see the `OUT` trap
   in §1) last, since it touches docs and generated files.
3. Write `docs/join-merch-store-plan_PHASE_4.5_HANDOFF.md`, mark 4.5 done in the plan, point the
   status line at it.

Model/effort per the plan: **Sonnet 5.5, medium.**
