# Join Merch Store — Phase 1 Handoff

## For Andrew (plain English)

Phase 1 is finished. It built the invisible foundation of the merch store: the product list with
prices, the maths that adds up an order, web-sized versions of your four photos, and the shade of
white the store panel will use so it matches the photos. **Nothing is visible yet and nothing is
live.** No menu row, no screen. The 8 MB of photos became four files of about 100 KB each, so the
store will load fast and cost almost nothing in bandwidth.

Needs from you: nothing blocks Phase 2. Still open: Q1 (where the printed QR points; decide before
anything is printed), Q2 (contact line), Q3 (descriptions/sizes: the wording in
`lib/merchCatalog.ts` is placeholder), Q4 (generic vs per-venue QR). Details in the plan §8.
Nothing is committed yet; the plan commits at the end of Phase 4.

---

## For the next agent (Phase 2: light sheet tone, `store` sheet id, menu row, empty host)

Read `docs/join-merch-store-plan.md` §3, §5 Phase 2 first. Plan says **Opus 5.5, effort high**.

### 1. Goal and scope
Phase 2 per the plan: `OwnerSheet` gets `tone?: "dark" | "light"` (dark output must be unchanged and
pinned by tests); add `"store"` to `OWNER_SHEET_IDS`; add the **Order Join Merch** menu row below
Venue Display (extend the `OwnerMenuItem` union with a "dashboard sheet" kind); host an empty
`MerchStoreSheet` in `app/owner/dashboard/page.tsx` with cart state in the page; update
`tests/owner-menu-contract.test.ts` and `docs/partner-dashboard-app-redesign-plan.md` §4b.
**Out of scope:** the real store UI (Phase 3), any API/DB/Stripe/fetch, docs rewrite (Phase 4).

### 2. Starting state
- Branch `main`, last commit `75563ec` ("Partner Dashboard Revamp"). **Nothing from this plan is
  committed.** Phase 1 files are working-tree changes; the 4 source PNGs and 4 WebPs in
  `public/store/` are **staged** (`git add public/store`, plan step 1). No push, no deploy.
- Pre-existing uncommitted edits (not mine; leave alone): `AGENTS.md`, `CLAUDE.md`,
  `SYSTEM_CONTEXT.md`, `docs/nfl-pickem-reward-phase3.md`, and `docs/join-merch-store-plan.md`
  (untracked, status line edited by me).
- No database, env var or Vercel change was made.

### 3. Decisions already made
All of plan §1 ("Decisions already made" and "Defaults chosen by the planner"); don't re-ask. Phase
1 added: webp quality **76** (80 left the round photo at 154 KB, over the 150 KB target); coaster
SKUs are `HTC-CST-RND-{100,250,500,1000}` / `HTC-CST-SQ-…`, `HTC-TENT`, `HTC-CARDSET`; the cart is
keyed by product id and, for coasters, stores the **pack size** (100/250/500/1000, 0/absent = none).

### 4. Files created / changed (Phase 1)
- `scripts/optimize-store-images.cjs` + npm script `store:images` (package.json). Converts
  `public/store/*.png` to `public/store/web/*.webp` (max 1200 px, q76) and **fails if any corner
  channel is below 0xFA**. Measured corners are 254. Sizes: card_holders 94 KB (1200×900),
  coasters_round 134 KB (1200×1200), coasters_square 106 KB (1200×800), table_tents 108 KB (1200×900).
- `lib/merchCatalog.ts`: `MERCH_CATALOG` (4 products), types `MerchProduct`/`MerchPricing`/
  `MerchProductId`, `MERCH_MAX_UNIT_QTY` (100), `MERCH_CURRENCY`, `getMerchProduct`. Image `width`/
  `height` are the real WebP pixel sizes.
- `lib/merchPricing.ts`: `MerchCart`, `formatCents`, `formatPerPieceCents` (`30¢`…`17.5¢`),
  `clampUnitQuantity(value, max)`, `findPack`, `isValidPack`, `lineTotalCents`, `cartLines`,
  `cartSummary` (`lineCount`, `pieceCount`, `subtotalCents`), `buildMerchOrderDraft(cart, {id,name})`.
  Note `cartSummary.lineCount` is the number of **distinct lines**; the plan's order bar says "3
  items", so decide in Phase 3 whether that means lines or `pieceCount` (lines is the sensible one).
- Colour token `--ht-store-paper: #fefefe` in `app/globals.css`; Tailwind `ht-store-paper` (both under
  `colors.ht` and `backgroundColor`, so `bg-ht-store-paper` works); `STORE_PAPER_HEX` in
  `lib/themeTokens.ts`.
- `tests/lib.merch-pricing.test.ts` (12 tests, all pass).

### 5. Facts and traps
- **3 tests fail on a clean tree too** (verified by `git stash -u`, running them, then `stash pop`):
  `tests/components.create-reward-wizard.test.ts` (1) and `tests/components.owner-rewards-flow.test.ts`
  (2). They expect "Which reward?" but get "Which game should the reward be tied …", which is the
  `NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED` branch in the local env. Unrelated to this plan; don't
  chase them, but report them. Everything else: 2,850 pass, 13 skipped.
- Using `git stash -u` is risky in this repo (see memory about lost work); it was restored cleanly,
  all files confirmed present afterward. Prefer not to repeat it.
- The PNGs have a faint grey contact shadow at the bottom edge; that's in the photo. Phase 3 must use
  `mix-blend-multiply` on the `<img>` and no card fill/border behind it.
- Use a plain `<img>` (or `next/image` with `unoptimized`) with width/height and `loading="lazy"`.
- `sed -i ''` was used on `package.json` (macOS). Fine; `.env.local` untouched.

### 6. Build / test commands, and what was verified
`npx tsc --noEmit` (clean), `npm run lint` (clean), `npm run test`, `npm run build` (passes; don't run
typecheck at the same time), `npm run store:images`, `npx vitest run tests/lib.merch-pricing.test.ts`.
Not verified: nothing renders yet, so no visual check of the white matching exists. That's Phase 3/4.

### 7. Open questions for Andrew
Q1–Q4 in the plan §8 (none block Phase 2).

### 8. Recommended first steps
1. Read `components/owner/sheet/OwnerSheet.tsx`, `components/owner/menu/ownerMenuItems.ts`,
   `components/owner/OwnerAppBar.tsx`, `lib/ownerSheetParams.ts`, `lib/useOwnerSheet.ts`, and the
   three contract tests named in plan Phase 2 (including `tests/owner-dashboard-contract.test.ts`
   for any "every flow sheet uses DiscardGuard" rule).
2. Snapshot/pin the dark `OwnerSheet` markup **before** adding `tone`, then add light.
3. Do menu + sheet-id + host, update the tests and `docs/partner-dashboard-app-redesign-plan.md`,
   run all four checks, then write `docs/join-merch-store-plan_PHASE_2_HANDOFF.md`.
