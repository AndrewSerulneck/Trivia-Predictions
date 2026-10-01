# Join Merch Store — phone checklist (for Andrew)

Only a real phone can judge this: a headless browser has no address bar, no select wheel, no Back
gesture and no screen reader. Do this **after the change is deployed** (nothing has been pushed
yet). Tick each box; write what you saw next to anything that looks wrong.
Plan: `docs/join-merch-store-plan.md`.

Use a partner account. For section G you need **two** venues on one account; for section H, an
account with **no** venue (or catch the store while the dashboard is still loading).

## A. Devices to cover
- [ ] iPhone, Safari (in the browser, not installed to the Home Screen)
- [ ] Android, Chrome
- [ ] A desktop browser (normal window, then narrowed to phone width)

## B. Opening the store
- [ ] Tap the logo top-left: the menu has **Order Join Merch** directly below Venue Display.
- [ ] Tap it: the menu closes and a **white** panel slides up titled "Hightop Challenge Store".
- [ ] Four products, in order: Round Coasters, Square Coasters, Table Tents, Table Card with Holder.
- [ ] Below them, a **Free — Print your own QR code** card with "Download PNG" and "SVG for printers".
- [ ] The bar at the bottom reads "Choose a quantity to start an order" and Review is greyed out.

## C. The white matches the photos
- [ ] Look at each product photo in **bright** light (near a window, phone brightness high): no
  grey or off-white box around any photo; the photo's background melts into the panel.
- [ ] Repeat in **dim** light (brightness low, or Night Shift / dark room). Still no box.
- [ ] The soft grey shadow under each product is fine — that is part of the photo.

## D. Choosing quantities
- [ ] Round Coasters: tap the pack picker. On iPhone the **select wheel** appears with None,
  100, 250, 500, 1,000. Pick 250: the card shows **$60** and the bottom bar's subtotal updates.
- [ ] Square Coasters: same wheel and prices ($30 / $60 / $100 / $175).
- [ ] Table Tents: tap **+** three times → 3, **$12**. Tap **−** back to 0. It never goes below 0.
- [ ] Type a number in the Table Tents box (e.g. 12): the keyboard is a number pad and the price
  follows.
- [ ] Table Card with Holder: + to 2 → **$16**.
- [ ] **Focus outline:** while the stepper box or a pack picker is focused, its outline is
  **indigo** (blue-purple), not cyan, and the borders are a light grey (not dark slate).
- [ ] No per-coaster price ("24¢ each") appears anywhere.

## E. Review and the phone's Back
- [ ] With something in the cart, tap **Review order**: it slides sideways to the review, which
  starts at the **top** (not scrolled down).
- [ ] Review lists each line, "6 × $4" style lines for Tents/Cards, Subtotal, "Shipping & tax —
  Calculated at checkout", Estimated total, and "Ships to <your venue>".
- [ ] "Back to store" has a visible grey outline.
- [ ] The final button reads **Ordering opens soon**, is greyed out, and tapping it does nothing.
  The note says "Nothing is ordered or charged yet."
- [ ] Phone **Back** from Review → back to the Shop. Back again → the store closes and you are on
  the dashboard (you do **not** leave the dashboard).
- [ ] **Reload on Review (F3):** open Review, then reload the page. You land on the Shop with an
  empty cart. Press Back **once**: the store closes. (It must not take two Backs.)

## F. The cart is kept
- [ ] Pick some items, tap **Close**, reopen Order Join Merch from the menu: the same items are
  still picked.
- [ ] (A full page reload empties the cart — that is expected for now.)

## G. One cart per venue (F1) — needs two venues
- [ ] On Venue A, pick 250 Round Coasters. Switch to Venue B (tap the venue name). Open the store:
  the cart is **empty**.
- [ ] Pick a Table Tent for B, open Review: "Ships to" says **Venue B**.
- [ ] Switch back to A, open the store: the 250 Round Coasters are still there, and Review says
  "Ships to **Venue A**".

## H. Store with no venue (F2)
- [ ] With an account that has no venue (or tapping Order Join Merch the instant the dashboard
  loads): the store still opens, the products and the free QR card work, and the bottom bar says
  "Ordering needs a venue on your account." (or "Loading your venue…" while loading). Review is off.
- [ ] Back closes it normally.

## I. Free QR download — the code is permanent, so check this carefully
- [ ] **iPhone:** tap "Download PNG". The image downloads (or opens — then long-press → Save to
  Photos). Open it: a black-and-white QR with a white border.
- [ ] **iPhone:** tap "SVG for printers". It downloads to Files (or opens in a new tab). Fine either
  way — it's for print shops.
- [ ] **Android:** both downloads land in Downloads; open the PNG.
- [ ] **Scan the PNG from another phone's camera** (show it on screen, or print it): it must open
  **play.hightopchallenge.com** and show the **player sign-in**. If it goes anywhere else, stop
  and tell Claude before anything is printed.
- [ ] The text under the QR reads play.hightopchallenge.com.

## J. Screen reader (F10)
- [ ] **iPhone VoiceOver** (Settings → Accessibility → VoiceOver, or triple-click the side button
  if set up): on the Shop, change a quantity with + or the pack picker. VoiceOver announces the
  new subtotal **once** — not twice.
- [ ] The + and − buttons are read with the product name ("Increase Table Tents").
- [ ] (Android TalkBack, if handy: same check.)

## K. Reduced motion, landscape, desktop
- [ ] **Reduced motion** (iPhone: Settings → Accessibility → Motion → Reduce Motion): the panel and
  the Shop ↔ Review change appear without the slide, and nothing is broken.
- [ ] **Landscape** on the phone: the store still scrolls, the bottom bar stays visible and nothing
  is cut off at the sides.
- [ ] **Desktop:** the panel is centred and not stretched across a wide screen; photos are crisp;
  Escape closes the store; Tab moves through the controls and stays inside the panel.

## L. Everything else is unchanged
- [ ] Schedule a live game and Offer a reward sheets still look dark and as before.
- [ ] Each step of Schedule and Rewards opens at the top (Phase 4.3 changed this for every sheet).

## M. Header "Order Join Merch" button (docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 1)
- [ ] On the dashboard, top right shows a cyan **Order Join Merch** button with a bag icon (the small
  bouncing logo is gone). Tapping it opens the store straight away — no menu first.
- [ ] With the store open, the **phone's Back** closes it and leaves you on the dashboard (one Back,
  not two). On a narrow phone (first-gen iPhone SE, 320 px) the button reads **Store** instead, and
  the venue name still shows at least a few words.
