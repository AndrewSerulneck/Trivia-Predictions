# Game tutorial cards — phone check (Andrew only)

Added 2026-10-16 (Phase 6 of `docs/partner-results-page-plan.md`). The rule: a game's tutorial cards show at most
once every 24 hours, per game, per phone/browser (not per venue). The 24 hours start when you **finish** the cards
(tap Play, or Join for Category Blitz). Backing out doesn't count.

To start fresh on a phone, clear the site's data (Safari: Settings → Safari → Advanced → Website Data) or use a
private tab.

1. **First open of the day shows the cards.** From venue home open Pick 'Em, Bingo, Fantasy and Category Blitz. Each
   shows its cards.
2. **Back out, then come back.** On Pick 'Em's first card tap Back. Open Pick 'Em again: the cards show again.
3. **Finish them, then come back.** Go through the cards and tap Play. Go back to venue home and open the game again:
   it goes straight into the game. No flash of cards, and no empty box.
4. **Reload straight into the game.** On `/pickem` (after step 3) pull to refresh. The game appears, with no flash of
   cards first.
5. **Category Blitz.** Close the cards with X: next open shows them again. Tap Join: next open goes straight in.
6. **Bingo card link.** Open a link to a specific Bingo card (`/bingo?date=…&cardId=…`, e.g. from a notification).
   It opens that card, both on a first open (via the cards' Play button) and after the cards were finished. Phone
   Back from the card doesn't bounce you forward into Bingo again.
7. **Other games are separate.** Finishing Pick 'Em's cards doesn't hide Bingo's.
