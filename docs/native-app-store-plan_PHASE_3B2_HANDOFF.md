# Native App Store Plan — Phase 3B.2 Handoff (`/info` Partner Login + Square badge)

**Date:** 2026-10-09. **Phase:** 3B.2 of `docs/native-app-store-plan.md` (Sonnet 5.5, medium).
**State:** built and verified. **Committed locally, NOT pushed, NOT deployed.** It sits on top of
`1fb5a1f` (3B.1) and `4706072` (2D+2E+3), also local only.

---

## Summary for Andrew (plain English)

**What changed (website only, `/info`).**
- **Partner Login is now easy to see on phones.** A bordered "Partner Login" button sits in the top bar
  next to the menu icon, so partners no longer have to open the hamburger menu. On computers the old
  plain-text link is now the same outlined button, next to "Get Started".
- **The hero** has a solid white **Partner Login** button (replacing the faint "Already a partner? Sign
  in"), and under the buttons the line you approved: "Venue partners: schedule games, set rewards and
  manage billing from any web browser — no app needed."
- **Square's "Built with Square" badge** is under "Works with your Square register!", shown whole and
  unaltered, on its own row with 40 px of space above and below, as Square's rules require.
- Nothing changes in the app (`/info` opens in the browser from the app). No server, database or cost
  impact: the badge is one 3 KB image.

**Is it live?** No — nothing is pushed. Screenshots (360, 390 and 1280 px wide) are in
`docs/native-app-store-plan_PHASE_3B2_screenshots/`; please look at them.

**What's left / needs you.**
1. Say when to **push** (2D+2E+3+3B.1+3B.2 go out together) and deploy.
2. Then the ~15-minute check in `docs/native-app-device-checklist.md` (3B.3), including a rebuild of the
   iPhone app (the one on your phone is still the Phase 3 build; it stops opening ~2026-10-16).
3. Square's rules say the badge must not be altered. If you want it to link somewhere (Square's own page)
   or sit elsewhere (pricing), tell the next agent; I did not make it a link.

---

## For the next agent

You have none of this conversation. Read `CLAUDE.md` (Native app bullets), `docs/native-app-store-plan.md`
(§2 item 12, §5, Phase 3B), and this file.

### 1. Next phase
**3B.3 is Andrew's device check** (not an agent task), preceded by his decision to push/deploy. After it:
**Phase 4a (native share + haptics, Sonnet 5.5 medium)** and **4b (in-app QR scanner, Sonnet 5.5 high)**;
4c/5/Part B wait for the paid Apple account. Out of scope here: store badges (Phase 7, label them "For players"),
anything in the app.

### 2. Starting state
- Branch `main`; last commit = the 3B.2 commit (`git log --oneline -4`). Unpushed: 3B.2, 1fb5a1f, 4706072.
  Vercel still runs `858660c`'s site, so the live site doesn't have 3B.1 or 3B.2.
- Untracked and deliberately uncommitted: `.vscode/settings.json` (not ours).
- Tracked iCloud conflict copies (`tests/* 2.ts`) predate this work; tell Andrew before deleting.
- No migrations, env vars, `vercel.json` change or production data touched. Devices unchanged from the 3B.1
  handoff (simulator + emulator have the 3B.1 debug build; Andrew's iPhone has the Phase 3 build).

### 3. Decisions (don't re-ask)
- Copy approved by Andrew as written (2026-10-09). Badge supplied by Andrew; Square's rules: don't alter,
  don't change proposition/colour, ≥40 px clear space.
- Badge is **not a link** and **not inline** with text; own row, `my-10` (= 40 px) above/below, `w-44`
  (176 px, ≈2.3× the 1125 px source downscaled; file is 352 px = 2×).
- Partner Login stays a plain `<a href="/owner/login">` (apex page; never `Link`, never web-only gated).
- Phone header button text uses `text-footnote` (13 px), height `min-h-11` (44 px). Verified no horizontal
  overflow at 360/390/1280.
- The hamburger menu still has its own Partner Login row (kept; harmless).

### 4. Files
- `app/info/page.tsx` — imports Lucide `LogIn`; desktop header button restyled; new phone-only
  `<a … md:hidden ml-auto>` before the hamburger; hero "Partner Login" white button + approved `<p>`;
  badge `<Image>` after "Works with your Square register!".
- `assets/partner-src/built-with-square-badge.png` — Andrew's original (1125×320, 1.46 MB), MOVED from
  `public/info/Square-brand_white.png` (not served). `public/info/` still holds other files.
- `public/brand/partners/built-with-square-badge.webp` — generated, 352×100, 3.1 KB. Outside
  `public/brand/web/` (immutable-cached a year): new artwork needs a NEW file name.
- `scripts/optimize-square-badge.cjs` + `package.json` script `square-badge:image` (sharp, same pattern as
  `brand:images`). Resize only; never trace to SVG.
- `tests/info-partner-login-contract.test.ts` — 4 tests (phone header link outside the menu, plain
  anchors / old wording gone, approved copy, badge alt + path + `my-10` + < 30 KB + source kept).
- `docs/native-app-store-plan_PHASE_3B2_screenshots/` — 4 PNGs. Plan status line + 3B.2 as-built updated.

### 5. Facts and traps
- `/info` is a `"use client"` page with a big inline `<style>`; nothing server-side to cache.
- I first ran `rmdir public/info`, which safely failed (other images live there) — don't assume the folder
  is empty.
- Dev server for screenshots: `npm run dev -- -p 3200`; I killed it with `pkill -f "next dev"`.
- Don't run typecheck and build at once (`.next/types`). Never `git checkout -- <file>` here.

### 6. Verified
`npx tsc --noEmit` clean; `npm run lint` clean; `npm run test`: 315 files passed / 1 skipped, **3,616 tests
passed / 13 skipped / 0 failed**; `npm run build` succeeds (Proxy listed). Playwright screenshots at 360,
390, 1280 px reviewed: header button visible and not crowding the logo, hero button/line/badge as intended,
no horizontal overflow. **Not verified:** a real phone browser, and the deployed site (3B.3).

### 7. Open questions for Andrew
Push/deploy timing; whether the badge should link to Square or appear on the pricing section too.

### 8. Recommended first steps
1. `git log --oneline -5`, `git status`. 2. Ask Andrew whether to push; if yes `git push origin main`, wait
for the Vercel deploy, then walk him through 3B.3 (rebuild iPhone shell per the Phase 3 handoff §6).
3. After his check, start 4a (read plan Phase 4a; `hasNativeCapability` pattern in `lib/nativeApp.ts`).
