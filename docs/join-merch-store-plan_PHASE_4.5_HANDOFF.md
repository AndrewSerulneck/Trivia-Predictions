# Join Merch Store — Phase 4.5 Handoff

## For Andrew (plain English)

Phase 4.5 is finished, on your computer only: **nothing is committed, pushed or deployed.**

What changed:
- **The 4 big original photos (about 8 MB) no longer ship with the website (F9).** They moved to
  `assets/store-src/`, which isn't served to visitors. The small optimized versions the store actually
  shows are unchanged (I regenerated them and they are identical, byte for byte).
- **Screen readers announce each price change once, not twice (F10).** The per-product price lines
  no longer announce themselves; the bottom order bar still does. Nothing looks different.
- **A test now guards the store's white (F8).** If the colour in `lib/themeTokens.ts` ever differs from
  the one in `app/globals.css`, the test fails. I also removed one unused re-export.

Checked: typecheck, lint, full tests (2,930 pass, 0 fail), production build. Nothing needs you.
Left: Phase 4.6 (phone checklist, as-built docs, commit).

---

## For the next agent (Phase 4.6)

### 1. Goal and scope
Read `docs/join-merch-store-plan.md` §5 "Phase 4.6" (Opus 5.5, medium):
1. Write `docs/join-merch-store-device-checklist.md` for Andrew's phone. Items listed in the plan, plus
   from later handoffs: on Review, "Back to store" shows a grey outline; the stepper field and pack
   select show an indigo (not cyan) outline when focused (4.4); one VoiceOver announcement per change
   (F10, now implemented in 4.5); a store with no venue (F2); QR PNG/SVG download and scan.
2. Rewrite the "planned" Join Merch notes in `CLAUDE.md`, `SYSTEM_CONTEXT.md`, `AGENTS.md` as as-built
   (exact files, `lib/joinQr.ts`, `npm run store:qr`, "QR URL is permanent", source photos in
   `assets/store-src/`).
3. Commit — **ask Andrew first** about the unrelated pre-existing edits (see §2). Push/deploy are
   Andrew's call. Optionally mention to Andrew: light `StepBack`/`NextButton` on other light surfaces
   (admin cards, `/owner` auth/billing) still have the invisible-border issue (4.4 handoff trap 4).
Out of scope: Phases 5–6, any API/table/Stripe/flag, product wording, contact line, "6 × $4" line.

### 2. Starting state
- Branch `main`, HEAD `75563ec`. **No commits from Phases 1–4.5.** Staged: the 4 PNGs now at
  `assets/store-src/*.png` (renamed via `git mv`) and 4 WebPs in `public/store/web/`. Everything else
  unstaged/untracked (`public/store/qr/` untracked).
- Pre-existing unrelated edits (don't revert): `AGENTS.md`, `SYSTEM_CONTEXT.md`,
  `docs/nfl-pickem-reward-phase3.md`, parts of `CLAUDE.md`; reward-wizard changes from 4.3
  (`lib/rewardDefinitions.ts`, `CreateRewardWizard.tsx`, their tests).
- Never `git checkout -- <file>` or `git stash` (user memory: destroyed work before).
- No server running; no temp files left (`build.log` removed).

### 3. Decisions (don't re-ask)
Plan decisions 1–11 stand. 4.5: kept `STORE_PAPER_HEX` and `isValidPack` (Phase 5 needs it); kept the
order bar as the single `aria-live` region.

### 4. Files changed in 4.5
| File | What |
|---|---|
| `tests/lib.store-paper-token.test.ts` | **New.** `STORE_PAPER_HEX` equals `--ht-store-paper` parsed from `app/globals.css` (regex, case-insensitive). |
| `lib/merchPricing.ts` | Removed `export { getMerchProduct };` (import kept for internal use). |
| `components/owner/store/MerchProductCard.tsx` | Removed `aria-live="polite"` from the two price lines. No test pinned it. |
| `scripts/optimize-store-images.cjs` | `SRC` = `assets/store-src`; `OUT` now explicitly `public/store/web` (it used to derive from `SRC`); header comment updated. |
| `assets/store-src/*.png` | The 4 source photos, `git mv`'d from `public/store/`. |
| `AGENTS.md`, `CLAUDE.md` | One-line path fixes for the source photos. |
| `docs/join-merch-store-plan.md` | Status line, §1/§2 photo paths (§1 table now points at the served `.webp`), Phase 4.5 marked DONE. |

### 5. Facts and traps
- Earlier handoffs (1–4.4) still say "PNGs under `public/store/`"; that is dated history, don't rewrite.
- `npm run store:images` output sizes: 94/134/106/108 KB; corner channel 254; `git diff` of
  `public/store/web/` was empty (identical).
- The Phase 3 trap about `npm run build | tail` hiding the exit code still applies: redirect to a file.

### 6. Build, run, test
`npx tsc --noEmit` → `npm run lint` → `npm run test` → `npm run build > build.log 2>&1; echo $?`
(sequential). Verified end of 4.5: tsc clean, lint clean, **2,930 passed / 13 skipped / 0 failed**
(274 files + 1 skipped), build exit 0. **Not verified:** real phone, VoiceOver (checklist covers it).

### 7. Open questions
None.

### 8. First steps for 4.6
1. Run the four checks to confirm §6.
2. Write the device checklist; update CLAUDE.md/SYSTEM_CONTEXT.md/AGENTS.md as-built.
3. Ask Andrew about the unrelated edits, then commit. Write `…_PHASE_4.6_HANDOFF.md`, update the plan's status line.
