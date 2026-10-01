# Join Merch Store — Phase 4 Handoff

## For Andrew (plain English)

Phase 4 is finished, on your computer only: **nothing is committed, pushed or deployed.**

What changed:
- **The per-coaster price is gone.** Picking a pack now shows "250 coasters · $60.00" with no
  "24¢ each", and the Review step shows "Pack of 250". The behind-the-scenes order summary no longer
  works out a per-coaster price either. Table Tents and Card Sets still show "$4 each" and
  "6 × $4 = $24.00" (the price you set, times the quantity). Say so if you meant to remove those
  too; it's a one-line change.
- **The QR code points to `play.hightopchallenge.com`.** I checked that the address already works
  today and opens the player sign-in.
- **Free QR download in the store.** Under the four products, a "Print your own QR code" card shows
  the code, says where it goes, and has two buttons: **Download PNG** (a large 2050 × 2050 image for
  menus) and **SVG for printers** (a vector file that stays sharp at any size). It's free with no sign-up.
  It's two small files (≈ 3 KB and 4 KB), so the cost is effectively zero. I tested both files by
  decoding them: they read `https://play.hightopchallenge.com`.
- **Product wording is untouched**, as you asked.
- **Code review done.** It found 10 issues. None of them is a live problem today, because nothing can
  be ordered yet and nothing is deployed. As you asked, I didn't fix them. Each one is written up with
  its fix as **Phases 4.1–4.5** in `docs/join-merch-store-plan.md`. **Phase 4.6** is the original
  wrap-up: the phone checklist, docs, and the commit. The most important one, F1: if a partner with
  two venues fills the cart and then switches venue, the cart quietly moves to the other venue.

Heads-up: the product **photos** are mock-ups that print `HighTopChallenge.com` on the cards. When real
merch is printed, it must use the QR file from the store (play.), not the photo's artwork.

Needs from you: nothing blocks Phase 4.1. Still open: Q2 (a contact line for the "Ordering opens
soon" note) and Q3 (real product wording, deferred on purpose).

---

## For the next agent (Phase 4.1)

Read `docs/join-merch-store-plan.md` §5 from "Code-review findings → fix phases" first. Each finding is
**F1–F10**, filed under the phase that fixes it, with its proposed fix. Earlier handoffs:
`docs/join-merch-store-plan_PHASE_1_HANDOFF.md`, `_PHASE_2_HANDOFF.md`, `_PHASE_3_HANDOFF.md`.
The Phase 3 handoff's "Facts and traps" (global form CSS, the `fetch(` tripwire reading comments, the
Playwright stub recipe, the 3 pre-existing test failures) all still apply.

### 1. Next phase's goal and scope

**Phase 4.1 (Opus 5.5, high):** F1 cart keyed by venue; F2 store mounted at page level so the menu row
works with no venue or while venues load (the free QR card must work there too, and Review is disabled);
F5 delete `openDashboardSheet`'s `router.push` fallback and add a contract rule. **Out of scope:** the
other findings (4.2–4.5 each have their own phase), API routes, tables, migrations, Stripe, feature
flags, any `fetch(` under `components/owner/store/`, product wording.

### 2. Starting state

- Branch `main`, HEAD `75563ec10b743da4f739562cf837f30bc1d43938` ("Partner Dashboard Revamp"). **No
  commits from Phases 1–4.** The 4 source PNGs and 4 WebPs under `public/store/` are staged; everything
  else is unstaged or untracked. No push, deploy, Vercel env change, database change or migration has
  happened in any phase.
- Pre-existing unrelated edits from before this plan: `AGENTS.md`, `SYSTEM_CONTEXT.md` and
  `docs/nfl-pickem-reward-phase3.md`. Don't revert them. `CLAUDE.md` holds both those older edits and
  this plan's "Join Merch Store" section, which Phase 4 edited (see §4). Ask Andrew before committing
  the unrelated ones together (Phase 4.6).
- Never `git checkout -- <file>` or `git stash` here (user memory note: it destroyed work before).
- No background processes left running. `next start -p 3123` was used for a screenshot and then killed.

### 3. Decisions made in Phase 4 (don't re-ask)

- **"Per-item price calculation" was read as the per-coaster price.** Removed: the card's "24¢ each",
  Review's "· 24¢ each", `formatPerPieceCents` (`lib/merchPricing.ts`) and `MerchOrderLine.unitPriceCents`
  (it was `priceCents / quantity`, which came out at 17.5 for the 1,000-pack, i.e. Phase 3 trap 3).
  `MerchOrderLine` is now `{ sku, productId, quantity, lineTotalCents }`, where `quantity` = pieces.
  **Kept:** the unit items' "$4 each" and "6 × $4 = $24.00" on the card, and "6 × $4" on Review (the
  unit price comes from the catalog's `pricing.unitPriceCents`, not the line). Andrew may still ask
  for those to go.
- **QR target: `https://play.hightopchallenge.com`**, no path and no trailing slash, as a **literal**
  in `lib/joinQr.ts`. It is deliberately not derived from `NEXT_PUBLIC_PLAY_HOST`: printed codes are
  permanent, and an env change must never silently change a download. On 2026-10-01 the host resolved
  (`cname.vercel-dns.com`) and returned 200 with the app's `<title>Hightop Challenge</title>`; with the
  domain split flag off, every host serves the same join flow at `/`.
- **One generic QR** (plan Q4). Error correction **Q** (~25% damage tolerance, for coaster rings and
  menu creases), 4-module quiet zone, black on white. That gives 41×41 modules including the margin.
- **Static files, not client-side generation.** `public/store/qr/hightop-challenge-qr.{png,svg}`
  generated once by `npm run store:qr` and committed. Plain same-origin `<a download>` links. No
  network request from the component, nothing recorded. `proxy.ts`'s matcher skips any path with a dot,
  so the files are public on every host.
- **Placement:** the free QR card sits **after** the product list on the Shop step (a test pins that
  order), so it reads as the alternative to buying, not as competition at the top.
- **Code-review findings were not fixed** (Andrew's instruction). They are Phases 4.1–4.5. Phase 4's
  original items 2–3 (device checklist, as-built docs, commit) moved to **Phase 4.6**.

### 4. Files created or changed in Phase 4

| File | What |
|---|---|
| `lib/joinQr.ts` | **New.** `JOIN_QR_URL`, `JOIN_QR_DISPLAY_URL`, `JOIN_QR_LEVEL = "Q"`, `JOIN_QR_MARGIN = 4`, `JOIN_QR_FILES` (`png`/`svg` → `src` + `download` name), `JOIN_QR_PNG_MIN_PX = 2048`. No imports, browser-safe, also `require`d by the script via tsx. |
| `scripts/generate-join-qr.cjs` | **New.** `renderToStaticMarkup(QRCodeSVG …)` (from `qrcode.react`, the encoder `app/tv/page.tsx` already uses) → SVG file. PNG: the SVG rasterized by sharp at 1 px per module, then nearest-neighbour upscaled by a whole number (`ceil(2048 / 41) = 50` → 2050 px), 2-colour palette PNG. |
| `package.json` | Added `"store:qr": "node --import tsx scripts/generate-join-qr.cjs"` after `store:images`. |
| `public/store/qr/hightop-challenge-qr.svg` / `.png` | **New, generated.** 4.1 KB / 3.0 KB. |
| `components/owner/store/FreeQrDownload.tsx` | **New.** `<section data-free-qr aria-labelledby="free-qr-heading">`: 112 px QR preview (`<img>` of the SVG, alt "QR code that opens play.hightopchallenge.com"), "FREE" eyebrow (emerald-700), "Print your own QR code" (`h4`), one-paragraph explanation, and two `<a download>` links (indigo "Download PNG", outlined "SVG for printers"), 44 px tall. Anchors aren't hit by the global `button`/`input` CSS, so no `!` utilities were needed. |
| `components/owner/store/MerchStoreSheet.tsx` | Renders `<FreeQrDownload />` after the product `<ul>` on the Shop step. Nothing else changed. |
| `components/owner/store/MerchProductCard.tsx` | Pack-chosen line: `"{n} coasters · <b>$X.00</b>"` (was `"{per-piece}¢ each · …"`). Import of `formatPerPieceCents` removed. |
| `components/owner/store/MerchReviewStep.tsx` | `lineDetail`: unit items `"{qty} × {catalog unit price}"`, packs `"Pack of {n}"`. No `findPack` / `formatPerPieceCents`. |
| `lib/merchPricing.ts` | Removed `formatPerPieceCents` and `MerchOrderLine.unitPriceCents` (with a doc comment on the line type). |
| `tests/lib.join-qr.test.ts` | **New.** Pins `JOIN_QR_URL`; decodes both committed files with `jsqr` (sharp → RGBA, 512 px nearest) and expects `JOIN_QR_URL`; checks the PNG is square and ≥ 2048 px; checks the download names match the files. |
| `tests/lib.merch-pricing.test.ts` | Dropped the per-piece test. New test: draft lines have exactly `lineTotalCents, productId, quantity, sku`, with integer totals. |
| `tests/components.owner-merch-store.test.ts` | Photo-on-paper test scoped to `li[data-product] img` (the QR preview isn't a product photo). Pack line expects `"1,000 coasters · $175.00"` and no `¢`/"each". Review expects `"Pack of 250"` and no `¢`/"each". New test: the free QR card's heading, URL text, preview src, both links' `href` + `download`, positioned after the last product. |
| `docs/join-merch-store-plan.md` | Status line; §1 decisions 5–8; §3b; §4 line shape; Phase 4 rewritten as done; **new Phases 4.1–4.6** with findings F1–F10; §6 cost; §8 Q1/Q4 answered. |
| `CLAUDE.md` | "Join Merch Store" section only: heading/status, plus two bullets (no per-item price; QR URL is permanent, `lib/joinQr.ts`, `npm run store:qr`, the decode test). |

### 5. Facts and traps found in Phase 4

1. **`/code-review` ran in a forked context** over the store paths only (it was told to exclude the
   unrelated `AGENTS.md`/`SYSTEM_CONTEXT.md`/`CLAUDE.md`/nfl doc edits). I checked F1, F2 and F5 against
   the code: `merchCart` state at `app/owner/dashboard/page.tsx:286`, above `DashboardBody
   key={selectedVenueId}` at `:356–357`, and the "No venue found" branch at `:350–352`;
   `openDashboardSheet` at `components/owner/OwnerAppBar.tsx:50–58`. F3, F4 and F6–F10 come from the
   reviewer's reading and match the Phase 3 handoff's own notes (trap 3, the `goBack("shop")`
   double-replace). Verify each again before fixing.
2. **F3 likely affects Schedule and Rewards too.** They use the same "corrected in place" pattern.
   Phase 4.2 must check them before deciding the fix's reach.
3. **QR generation quirks:** `QRCodeSVG` needs `xmlns` passed explicitly for a standalone `.svg`
   (`renderToStaticMarkup` doesn't add it); the script rewrites `width`/`height` to the module count
   before rasterizing so sharp renders exactly 1 px per module. Run the script **without**
   `--conditions react-server` (that condition hides `react-dom/server`).
4. **`sharp` reports the PNG as 3 channels** (palette expanded), which is expected.
5. The store test still prints many "Not implemented: Window's scrollTo()" lines from jsdom. That's
   harmless noise from `useModalOverlay`, and it was already there before Phase 4.

### 6. Build, run and test

Sequential (never typecheck concurrently with build):
```
npx tsc --noEmit
npm run lint
npm run test
npm run build
```
Targeted:
```
npx vitest run tests/components.owner-merch-store.test.ts tests/lib.merch-pricing.test.ts \
  tests/lib.join-qr.test.ts tests/owner-dashboard-contract.test.ts tests/components.owner-sheet.test.ts \
  tests/navigation-controls-contract.test.ts tests/owner-menu-contract.test.ts \
  tests/lib.owner-sheet-params.test.ts tests/components.owner-app-bar.test.ts
```
Regenerate the QR (only if `lib/joinQr.ts` changes, which means a reprint): `npm run store:qr`.

Verified 2026-10-01, end of Phase 4:
- `npx tsc --noEmit`: clean. `npm run lint`: clean (the usual Babel `lib/sportsBingo.ts` note).
- `npm run test`: **2,896 passed, 13 skipped, 3 failed**. All 3 failures are the known pre-existing
  ones (`tests/components.create-reward-wizard.test.ts` ×1, `tests/components.owner-rewards-flow.test.ts`
  ×2, caused by the `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED` branch in the local env).
- `npm run build`: exit 0.
- Both QR files decoded with `jsqr` → `https://play.hightopchallenge.com`.
- **Real browser** (Chromium/Playwright, `next start -p 3123`, `/api/owner/**` stubbed as in the Phase 3
  handoff trap 6) at 390×844 on `/owner/dashboard?sheet=store`: the QR card renders below Table Card
  with Holder, the layout is clean, and clicking **Download PNG** fires a download named
  `hightop-challenge-qr.png`. No page errors.

**Not verified:** a real phone (download behaviour on iOS Safari / Android Chrome, scanning the
printed/downloaded code with a camera), VoiceOver. These are on Phase 4.6's checklist.

### 7. Open questions for Andrew

- Did "per-item price calculation" also mean the unit items' "6 × $4 = $24.00" line? (§3 above;
  the default kept it.)
- Q2 (contact line in `MERCH_ORDER_CONTACT`) and Q3 (product wording, deferred). Neither blocks 4.1–4.6.

### 8. Recommended first steps for Phase 4.1

1. Run the targeted tests, then the four checks, to confirm §6.
2. F1: change the page state to `Record<venueId, MerchCart>` in `app/owner/dashboard/page.tsx`. Write
   the two-venue test first.
3. F2: move `<MerchStoreSheet>` out of `DashboardBody` to page level (inside the page's `<Suspense>`,
   because `useOwnerSheet` needs it), make `venue` nullable, and disable Review with explanatory copy
   when it's null. Update `tests/owner-dashboard-contract.test.ts`, which pins how the store is
   hosted.
4. F5: delete the fallback in `openDashboardSheet` and add the contract rule.
5. Write `docs/join-merch-store-plan_PHASE_4.1_HANDOFF.md` and update the plan's status line.

Model/effort per the plan: **Opus 5.5, high.**
