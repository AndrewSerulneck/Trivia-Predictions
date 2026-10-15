# Prize Gift Card Redesign — Phase 1 Handoff

## Summary for Andrew (plain English)

Phase 1 is done. It was writing-only: the "minimal and simple" design rule is now written into the
brand guidelines, `CLAUDE.md`, `AGENTS.md` and `SYSTEM_CONTEXT.md`, and the gift card's colors are
saved as shared design settings. **Nothing visible changed on the site or app** — no screen, no
database, no money, no deployment. It is **not committed or pushed** (your call). Next is Phase 2:
building the card itself and making a picture of it for you to approve. **Nothing needs you now**;
you will be asked to approve the picture at the end of Phase 2.

---

## For the next agent (Phase 2)

Read `docs/prize-gift-card-redesign-plan.md` first (§1 decisions are final; §2 is the spec; Phase 2
at §3). You have none of my context; everything is in the repo.

### 1. Phase 2 goal and scope
Build `lib/prizeCardFace.ts`, `components/prizes/PrizeCard.tsx` (+ bouncing logo), the
`logo-tap-bounce` keyframe in `tailwind.config.ts`, `scripts/render-prize-card.cjs`
(+ `npm run prize-card:render`), tests, and a specimen PNG. Model/effort per plan: Opus 5.5, high.
**Out of scope:** changing what `PrizeWalletPanel` renders (only move the label helpers out, output
identical), anything in Phases 3–5. **Do not start Phase 3** without Andrew approving the specimen
(record approval in your handoff). Also needs: a Phase 2 handoff note (global CLAUDE.md rule).

### 2. Starting state
- Branch `main`, last commit `5cc151c`. **Nothing from Phase 1 is committed.** Uncommitted:
  `design-system/hightop-challenge-design-system/project/README.md`, `design-system/project/README.md`,
  `design-system/hightop-challenge-design-system/project/colors_and_type.css`, `lib/themeTokens.ts`,
  `SYSTEM_CONTEXT.md`, `CLAUDE.md`, `AGENTS.md`, `docs/prize-gift-card-redesign-plan.md` (status line),
  this file. `next-env.d.ts` was already modified before Phase 1 (Next regenerates it; not ours).
- No data, DB, env or deploy changes.

### 3. Decisions made
Andrew's six decisions are in plan §1 (don't re-ask). Planner defaults not yet vetoed: drop "Awarded
{date}", keep "coupon" in staff wording, legacy Weekly Prize Wins out of scope. Q1–Q3 (plan §6) are
still open and don't block Phase 2.

### 4. What Phase 1 changed
- Both brand READMEs (canonical `design-system/hightop-challenge-design-system/project/README.md` and
  older `design-system/project/README.md`): new `### Minimal and simple` right under
  `## VISUAL FOUNDATIONS`, and `### Prize cards` before `### Buttons`.
- `colors_and_type.css` (canonical only; the older copy's CSS was NOT touched): added
  `--ht-prize-card-base-from/-to`, `-glow-cyan`, `-glow-violet` at the end of the `:root` block.
- `lib/themeTokens.ts`: new exported `PRIZE_CARD` (const object of full Tailwind class strings:
  `base`, `glow`, `highlight`, `edge`, `shadow`, `shape`, `text`, `labelText`, `venueText`), placed
  just above `PARTNER_EMAIL_THEME`. Read it in `PrizeCard`; no ad-hoc hex in `components/prizes/`.
  Note `PRIZE_CARD.shape` includes `w-full max-w-sm` and the aspect ratio; the plan's `p-5`/`p-6`
  padding is size-dependent and is NOT in the token — set it in the component.
- `SYSTEM_CONTEXT.md` §10: design-principle bullet; gold line now says prize cards use midnight +
  cyan→violet. `CLAUDE.md` Code Style: "Design: minimal and simple" bullet. `AGENTS.md`: new "Prize gift
  card redesign" section before "Adding a new Reward definition".

### 5. Facts and traps
- `npx tsc --noEmit` prints `TS2307` errors under `.next/types/…checker-status…` — stale generated
  types, pre-existing, unrelated. Filter with `| grep -v "^.next/"`; zero errors remain.
- Never run typecheck and build at the same time (`.next/types` regenerates).
- Andrew runs `next dev` on :3000 (holds `.next/dev/lock`); don't kill it. Browser-test from a
  scratchpad clone with no `.env.local` and mocked routes. Never do a real redemption/Square call.
- Don't overwrite `/brand/web/*` files (cached a year); use `htc-logo-96.webp` / `-192.webp` as they are.
- `PRIZE_CARD.glow` uses an arbitrary-value radial gradient; verify Tailwind v3 emits it (underscores
  for spaces) when you render the specimen. If it fails, fix the token string, not the component.
- The text-size-floor test rejects `text-[…]` under 12px; use `text-caption`/`text-footnote`.

### 6. Build / test
`npm run test` (Vitest): **388 files passed, 1 skipped; 4,585 tests passed, 13 skipped, 0 failed** after
Phase 1. `npx tsc --noEmit` clean apart from the stale `.next/types` noise; eslint on `lib/themeTokens.ts`
clean. Unverified: that the glow class string actually renders (first exercised in Phase 2); `npm run
build` and `npm run lint` (full) were not run — docs/tokens only.

### 7. Open questions for Andrew
Plan §6 Q1 (rename "coupon" in staff wording — default no), Q2 (drop "Awarded {date}" — default drop),
Q3 (sample venue name — default "YOUR VENUE"). Not blocking.

### 8. Recommended first steps
1. Read plan §2 and Phase 2 (§3); read `LiveCouponFrame.tsx`, `PrizeWalletPanel.tsx`, `lib/haptics.ts`.
2. Write `lib/prizeCardFace.ts` + its test first (pure; table in §2.2), moving
   `MENU_ITEM_LABEL`/`menuItemLabel`/`discountLabel` out of `PrizeWalletPanel.tsx` with its output unchanged.
3. Build `PrizeCard` + logo + keyframe, then the render script and `--specimen`; view the PNG yourself.
4. Run gates, write the Phase 2 handoff with the specimen path, and ask Andrew to approve.
