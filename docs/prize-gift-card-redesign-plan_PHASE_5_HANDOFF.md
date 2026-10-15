# Prize Gift Card Redesign — Phase 5 Handoff

## Summary for Andrew (plain English)

**Partners now learn where guests find their prizes.** Two places:

- **The Welcome Email** has a new section after the feature list: **"Where guests find their
  prizes"**, a short paragraph and a picture of the new gift card ($25, "YOUR VENUE").
- **The Partner Manual** has a new section, **"Where Guests Find Their Prizes"**, right after
  "Offer Rewards". It shows the real card (the logo bounces if you tap it) and explains the flow.

The wording describes the flip: the guest opens Redeem Prizes, **taps the card to flip it**, taps
**Redeem** on the back; staff tap the card (it sparkles, live clock) and the guest taps **Confirm
Redemption**. The manual also says the back shows when a prize was redeemed, so a partner can tell
if it was used early. **You can edit the email wording** in `lib/email/partnerEmailCopy.ts`
(`prizesSection`) and the manual's in `lib/partnerManual.ts`.

**Nothing is committed, pushed or deployed.** No server, database, money or request changes. The
email picture is a new 60 KB file; it only appears in emails once this is deployed (the email links
to the live site's copy).

**Look at (in VS Code):** `public/brand/email/prize-card-v1.png` (the email picture),
`tmp/p5-email-375.png` and `tmp/p5-email-600.png` (the new email section on a phone and a desktop),
and `tmp/email-previews/welcome.html` (the whole email; open in a browser).

**What needs you:** nothing blocks Phase 6. Q1–Q6 stay on their defaults (see plan §6). Q3 ("YOUR
VENUE" on the sample) is what's in the picture; changing it means re-rendering to a `-v2` file.

---

## For the next agent (Phase 6: review, phone checklist, wrap-up)

You have none of my context; read `docs/prize-gift-card-redesign-plan.md` (§1 decisions, §3 Phase 6,
§5 traps) and the Phase 4 handoff (the flip) first.

### 1. Phase 6 goal and scope
Plan §3 "Phase 6": (1) `/code-review` at high on the whole plan's diff (Phases 1–5, all
uncommitted) and fix findings; (2) write `docs/prize-gift-card-redesign-device-checklist.md` for
Andrew (items listed in the plan, plus the Phase 4 "unverified" list in
`…_PHASE_4_HANDOFF.md` §6 and: the welcome email in Gmail iOS/web, Apple Mail, Outlook — image
shows, 480 px max, not stretched; the Partner Manual section on a phone); (3) final updates:
`CLAUDE.md` short "Prize cards" bullet (one component `PrizeCard`, faces from
`lib/prizeCardFace.ts`, tokens `PRIZE_CARD`, render script, **email asset versioning rule**),
`SYSTEM_CONTEXT.md` §8 (prize delivery is a digital gift card), `AGENTS.md` status, plan status
line. Model per plan: Opus 5.5, high.
**Out of scope:** server/API changes, renaming "coupon" (Q1), the legacy "Weekly Prize Wins" list,
committing/pushing/deploying (Andrew's call; ask).

### 2. Starting state
- Branch `main`, last commit `5cc151c`. **Nothing from Phases 1–5 is committed, pushed or
  deployed.** No data, migration, env var, flag or `vercel.json` change in any phase.
- Phase 5 changed/added:
  - `scripts/render-prize-card.cjs`: new `--email` mode (card 384 px wide at device scale 2.5 →
    960 px PNG, flattened on `#0f172a` via `sharp`, palette `quality 70, colours 96, dither 0.6`,
    fails with exit 1 if over 60 KB). Output `public/brand/email/prize-card-v1.png` (**60 KB —
    right at the limit**; if the card art changes, re-run and expect to retune the palette).
  - `public/brand/email/prize-card-v1.png` (new asset, 960×608).
  - `scripts/build-partner-email-assets.cjs`: comment only, pointing at the above.
  - `lib/email/partnerEmailCopy.ts`: `WELCOME_EMAIL.prizesSection` `{ title, body, imageAlt,
    imageFile }` (the file name lives with the copy so a `-v2` bump is one edit).
  - `lib/email/welcomeEmail.ts`: `prizesHtml` row placed after the feature tour (before games), the
    `<img width="480" style="width:100%;max-width:480px;height:auto">`; plain text gets title + body.
  - `lib/partnerManual.ts`: new section "Where Guests Find Their Prizes" after "Offer Rewards",
    `figure: "prize-card"` (new optional field on `PartnerManualSection`).
  - `components/owner/PartnerManual.tsx`: renders `<PrizeCard face={SAMPLE_PRIZE_CARD_FACE} />`
    for `figure === "prize-card"`. No `back` prop → flat card, never flips. Copy stays in `lib/`.
  - Tests: `tests/lib.email.welcomeEmail.test.ts` (+1), new
    `tests/components.partner-manual-prizes.test.ts` (2).
  - Docs: plan status line, `AGENTS.md`, this file.

### 3. Decisions (don't re-ask)
- Q1–Q6 use plan defaults. Copy follows the flip (the plan's draft said "tap Redeem"; adjusted to
  "tap the card to flip it over, then tap Redeem on the back").
- The manual adds one sentence the plan didn't: the back shows when a prize was redeemed (the
  early-redemption safety). The email body is the plan's draft with only the flip adjusted.
- Email image is the **large** card at 384 px wide scaled to 960 px (the card is `max-w-sm`, so a
  480 px layout width would not fill it).

### 4. Facts and traps
- Tests: vitest only picks up `tests/*.test.ts` — a `.test.tsx` file silently does NOT run. Use
  `createElement`.
- The email image URL is absolute on the marketing host (`marketingUrl`), so it 404s in a real
  inbox until the commit is deployed; `npm run email:preview` rewrites it to the local file.
- Email assets under `/brand/email/` are cached long; new artwork ⇒ new file name, never overwrite.
- `sed -i` on macOS needs `sed -i ''`.
- Typecheck prints stale `.next/types` errors; filter `| grep -v "^.next/"`. Never run typecheck
  and build together. Never touch Andrew's `next dev` on :3000.

### 5. Verified
- `npx tsc --noEmit` and `npm run lint`: clean. `npm run test`: 392 files passed, 1 skipped; 4,663
  tests passed, 13 skipped, 0 failed. `npm run build`: succeeded.
- `npm run email:preview`, then screenshots of the new section at 375 and 600 px
  (`tmp/p5-email-*.png`): text wraps, image scales, no horizontal overflow.
- **Not verified:** the Partner Manual section in a real browser (covered by a jsdom test only —
  check it at 375 px on the dark sheet; the card there is flat and its logo is a button, which needs
  `!border-0` per plan §5, already in `PrizeCardLogo`); the email in real mail clients (Gmail dark
  mode may adjust colours; Outlook ignores `border-radius` on the image, harmless); everything on
  Phase 4's unverified list.
- `npm run test:pwa-contract` was not re-run this phase (nothing it covers was touched).

### 6. Open questions for Andrew
Q1–Q3 (plan §6) still open on defaults; Q4–Q6 answered by defaults. Whether/when to commit, push and
deploy (the email picture needs the deploy to show in inboxes).

### 7. Recommended first steps
1. Read the whole diff (`git status`; Phases 1–5 files are listed in each phase handoff).
2. `/code-review high`; fix findings; re-run tsc, lint, `npm run test`, `npm run test:pwa-contract`,
   build (never concurrently).
3. Browser-check the Partner Manual section at 375 px from a scratchpad clone (Phase 3 handoff §5).
4. Write the device checklist, final context-file updates, and the Phase 6 handoff/release notes.
