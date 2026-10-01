# Join Merch Store — Phase 4.6 Handoff

## For Andrew (plain English)

The Join Merch Store work is finished and **saved as commits on your computer** (branch `main`).
It is **not pushed and not deployed** — that's your call.

What changed in this last phase:
- **A phone checklist for you:** `docs/join-merch-store-device-checklist.md`. Do it after you deploy.
  The most important item is section I: download the free QR and **scan it with another phone** —
  it must open play.hightopchallenge.com's sign-in, because that QR gets printed and can never change.
- **The project notes** (`CLAUDE.md`, `SYSTEM_CONTEXT.md`, `AGENTS.md`) now describe the store as
  built, not as planned.
- **Two commits**, as you chose:
  1. `Reward wizard: "Which game" buttons show the game name` — your small unrelated reward tweak.
  2. `Join Merch Store: look-only partner store …` — everything from Phases 1–4.6.

Checked before committing: typecheck, lint, full tests (2,930 pass, 0 fail), production build.

One thing to know (optional follow-up, not part of this plan): on other *white* screens that use the
shared Back/Next buttons (admin cards, the `/owner` sign-in and billing setup pages), those buttons'
borders can still be invisible. The store fixed this only for its own panel.

---

## For the next agent

### 1. Goal and scope
The plan (`docs/join-merch-store-plan.md`) has **no further scheduled phase**. Phases 5 (real orders +
Stripe one-time Checkout + `merch_orders` tables) and 6 (3PL integration) are **future and
unscheduled — do not start them without Andrew.** Likely next work instead: Andrew's device-checklist
results (fix anything he reports), or a push/deploy if he asks.
Still out of scope without Andrew: any API route/table/Stripe/flag for the store, product wording
(decisions 8/10), the contact line (9), the "6 × $4" line (11), the QR URL (6).

### 2. Starting state
- Branch `main`. Commits on top of `75563ec`:
  1. `49efb6f` — reward wizard `gameName` (5 files: `lib/rewardDefinitions.ts`,
     `components/rewards/CreateRewardWizard.tsx`, its test + snapshot, `docs/nfl-pickem-reward-phase3.md`).
  2. The Join Merch Store commit (`git log --grep "Join Merch Store"`) — all Phases 1–4.6 files,
     including the 4 source PNGs in `assets/store-src/` (~8 MB, needed by `npm run store:images`),
     the WebPs in `public/store/web/` and the QR files in `public/store/qr/`.
- **Not pushed, not deployed.** No database, env var, flag or cron change exists in this plan.
- Working tree should be clean after commit 2 (check `git status`).

### 3. Decisions already made
Plan §1 decisions 1–11 stand. 4.6: Andrew chose **"two commits"** (unrelated reward tweak separately,
then the store).

### 4. Files created/changed in 4.6
| File | What |
|---|---|
| `docs/join-merch-store-device-checklist.md` | **New.** Sections A–L: devices, opening, white-vs-photo in bright/dim light, iOS select wheel, stepper, indigo focus outline, Review + phone Back, reload-on-Review one Back (F3), cart kept, per-venue cart (F1), no-venue store (F2), QR PNG/SVG download + scan (iPhone + Android), VoiceOver once per change (F10), reduced motion, landscape, desktop, other sheets unchanged. |
| `CLAUDE.md` | Join Merch section header/intro now as-built; lists `components/owner/store/` files, checklist, `scripts/generate-join-qr.cjs`, "never change the URL". |
| `SYSTEM_CONTEXT.md` | §0 item 4 as-built (files, look-only, QR permanence, photo paths); drawer row list gains Order Join Merch; `?sheet=store` no longer "planned". |
| `AGENTS.md` | Join Merch section as-built (status, files, QR permanence, checklist). |
| `docs/join-merch-store-plan.md` | Status line → this handoff; Phase 4.6 marked DONE. |

### 5. Facts and traps
- **Trap hit this phase:** the 4.5 handoff left the PNG renames and WebPs *staged*. A plain
  `git commit` after `git add <reward files>` swept them into the reward commit. Fixed with
  `git reset --soft HEAD~1` + `git restore --staged assets/store-src public/store/web` (index only,
  nothing on disk touched) and recommitting. Always check `git diff --cached --stat` before committing.
- `tests/components.owner-rewards-flow.test.ts` carries both the heading-copy fix (matches the
  "Which game should the reward be tied to?" heading already in `75563ec`) and Phase 4.2/4.3 changes,
  so it went in the store commit; at `49efb6f` alone that one test file is stale (it was already
  stale at `75563ec`).
- `https://play.hightopchallenge.com` answered **HTTP 200** on 2026-10-01 (curl), so the QR's target
  is live even though the domain split flag is off.
- Never `git checkout -- <file>` or `git stash` (user memory: destroyed work before).

### 6. Build, run, test
`npx tsc --noEmit` → `npm run lint` → `npm run test` → `npm run build > build.log 2>&1; echo $?`
(sequential; not concurrent). Verified 2026-10-01 before commit: tsc 0, lint 0,
**2,930 passed / 13 skipped / 0 failed** (274 files + 1 skipped), build exit 0.
**Unverified:** everything in the device checklist (real phones, VoiceOver, QR scan).

### 7. Open questions for Andrew
- When to push/deploy.
- Device-checklist results.
- Optional: fix invisible borders on light `StepBackButton`/`NextButton` outside the store (4.4 trap 4).

### 8. Recommended first steps
1. `git status` and `git log --oneline -3` to confirm the two commits and a clean tree.
2. If Andrew reports checklist failures, fix them as a small new phase (Opus 5.5, medium) with its
   own handoff, re-running §6.
