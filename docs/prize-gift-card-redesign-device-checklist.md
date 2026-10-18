# Prize Gift Card — Phone Checklist (Andrew)

Plan: `prize-gift-card-redesign-plan.md`. Only a real phone can sign this off: headless browsers
can't show the flip, haptics, Reduce Motion or real mail apps.

**Before you start:** this work must be **deployed** first (nothing is committed yet). The email
picture only shows in a real inbox after the deploy.

**Phones:** iPhone app (A), Android app (B), iPhone Safari (C), Android Chrome (D). Tick a column
when it passes; write a note when it doesn't.

**Test prizes:** win (or have an admin award) a prize at the hidden test venue
`venue-hightop-test`: a dollar gift card, and a menu-item prize (e.g. 50% off an entrée). For the
Square checks use a real Square venue on the live site (Square can't be tested from a dev server).

---

## 1. The card on Redeem Prizes

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 1.1 | Each prize is one midnight-navy card with a soft cyan→violet glow top-right. Logo top-left, prize ("$25" / "50% Off Entrée") large, venue name bottom-left, "GIFT CARD" / "REWARD" bottom-right. Nothing else on the card. | | | | |
| 1.2 | Under each card, one quiet line: the expiry and "Tap the card for details". An expiring-today prize shows that part in red. | | | | |
| 1.3 | The cards line up with the page edges (no extra inset), on the smallest phone you have. | | | | |
| 1.4 | Tap the **logo**: it bounces, with one small buzz. It does **not** flip the card. | | | | |
| 1.5 | Tap anywhere else on the card: it flips over smoothly (about half a second), with one small buzz. | | | | |
| 1.6 | The back reads normally, **not mirrored** (watch iPhone especially). It shows Won, For, Terms, Expires and a white **Redeem** button. | | | | |
| 1.7 | Tap the back (not the button): it flips back to the front. | | | | |
| 1.8 | On the back, Redeem opens the redeem sheet. The card doesn't flip again when you tap the button. | | | | |
| 1.9 | Turn on **Reduce Motion** (iPhone: Settings → Accessibility → Motion; Android: Remove animations). The logo blinks instead of bouncing; the card fades to its back instead of turning. | | | | |

## 2. Redeeming (the test venue)

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 2.1 | The sheet shows "Show this to staff, then tap Confirm Redemption." and the big card, with the live clock and moving shimmer. | | | | |
| 2.2 | Tap the big card: it sparkles and buzzes **once** (not twice). **Note: it also flips to its back** (Terms, Expires). Tap again to flip it back. Is that OK for staff? (See question at the end.) | | | | |
| 2.3 | Tap the big card's logo: it bounces and sparkles, buzzes once, doesn't flip. | | | | |
| 2.4 | Confirm Redemption → "Redeemed!". Back on the list, the card is greyed with a "Redeemed" chip and no button on its back. | | | | |
| 2.5 | Flip the redeemed card: the back says "Redeemed {date}, {time}" with the right time, and every detail is still clearly readable (not greyed). | | | | |
| 2.6 | Android app: with the sheet open, the phone's Back button closes the sheet. | | | | |

## 3. Square gift card (a Square venue, live site)

| # | Check | A | B | C | D |
|---|---|---|---|---|---|
| 3.1 | A gift-card prize: Redeem opens "Pay with a Square gift card" above the card. The amount in the sentence matches the card ("$25", not "$25.00"). | | | | |
| 3.2 | "Get my Square gift card" → the card now shows the balance and **GIFT CARD**, with the number and barcode below it. Staff can ring it up. | | | | |
| 3.3 | A dollar-off menu prize set to "gift card" at the register: after step 3.2 its card also says **GIFT CARD** (not REWARD). | | | | |
| 3.4 | Back on the list, that prize's back has a **Show gift card** button that reopens the number. Its back says "Turned into a Square gift card {date, time}" and has no Expires row. | | | | |
| 3.5 | Once the balance is spent: the card says "Used" and its back says "Used up", no button. | | | | |

## 4. Partner side

| # | Check | Phone | Desktop |
|---|---|---|---|
| 4.1 | Partner Manual → "Where Guests Find Their Prizes" (after "Offer Prizes"): the text reads well and the sample card ("$25", "YOUR VENUE") fits the sheet. Tapping its logo bounces it; the card itself does not flip. | | |
| 4.2 | Welcome Email ("Where guests find their prizes", after the feature list) in **Gmail iPhone app**: picture shows, not stretched, no wider than the text. | | |
| 4.3 | Same in **Gmail on the web** (also try dark mode). | | |
| 4.4 | Same in **Apple Mail** (iPhone and Mac). | | |
| 4.5 | Same in **Outlook** (square corners on the picture are fine). | | |

To get a test welcome email, sign up a throwaway partner, or ask the next agent to send one.

## 5. Keyboard (desktop browser, optional)

| # | Check | Pass |
|---|---|---|
| 5.1 | Press Tab on Redeem Prizes: a white "Show details" pill appears on the card; Enter flips it; on the back, Tab reaches Redeem. | |

---

## Question for you after the pass

**In the redeem sheet, should staff tapping the big card flip it?** Today it does, because you asked
for the card to flip on tap (plan §1 item 8 and §2.8). Staff are also told to tap the card to see the
sparkle. So their tap turns it to the back. The back shows the Terms ("Good for $25 off your bill")
and expiry, and a second tap turns it back. If that confuses staff, the next agent can stop the
**big** card from flipping. List cards would still flip. That's a small change.
