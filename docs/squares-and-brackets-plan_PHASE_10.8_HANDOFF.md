# Squares & Brackets plan — Phase 10.8 handoff (Brackets launch, 2026-10-21)

## For Andrew (plain English)

- **March Madness Brackets is switched on in Production** (you chose to launch now and skip the phone pass).
- Nothing changes for players yet: the Venue Home card appears on **Mar 1, 2027** as a teaser and opens on Selection
  Sunday, **Mar 14**. Nothing talks to the score feed or the database for brackets before Mar 14.
- **What partners see now:** the bracket Prize is offered in the Create Prize wizard, and the Rules page has the bracket
  section (its "last updated" date is now October 21, 2026).
- **Rehearsals are off in Production.** If you ever want another practice run, say so and the switch goes back on.
- The two old test brackets from the first rehearsal now show the right date (Oct 21) in Results.
- **Next for you:** nothing until Selection Sunday. Then 10.9 checks the tournaments were created correctly.

## For the next agent (10.9 — Selection Sunday and live watch)

### 1. Goal and scope
10.9 (plan §4): on **Sun Mar 14, 2027** evening, check discovery created both 2027 tournaments (feed `season` 2026),
region names, all 32 Round-of-64 games per tournament and the opening-round links; fix any First Four placeholder with the
admin fix-up tools before the men's lock **Thu Mar 18** (women's Mar 19). Watch logs Mar 18–21 and Apr 4/5: prizes
settled, `prizes_settled_at` stamped; record request counts against plan §6 for Phase 11.
Out of scope: Squares (6.5–6.9), any code change without a new sub-phase.

### 2. Starting state
- Branch `main`. The launch commit (this note, plan §27, `lib/legalInfo.ts`, one CLAUDE.md bullet) is pushed; the push
  deploys Production. Earlier: `3907b0a` (10.7.1 docs) pushed 2026-10-21.
- **Production env (Vercel project `hightop-challenge`):** `NEXT_PUBLIC_BRACKETS_ENABLED=true` (added 2026-10-21),
  `BRACKETS_REHEARSAL_ENABLED=false` (updated, not removed). Preview scope `brackets-rehearsal` still has both on.
- **Database:** no current `bracket_tournaments` row; all bracket migrations through `20261021203544` applied. Both
  test bracket prizes (`216ae2f4-42dc-42c5-bbeb-2ca5b10ce478`, `42449580-888d-468a-9e68-d395f562c693`, at
  `venue-hightop-test`) are inactive. One-off data write: archived rehearsals `f6728bdc-6f31-4279-9c2b-50ac71f065b6` and
  `53323143-b77c-4efc-999e-a0c78121c600` got `main_lock_passed_at = 2026-10-21T19:25:40Z`,
  `second_lock_passed_at = 2026-10-21T19:28:40Z` (previously null; undo = set both back to null). Approximate (±2 min),
  read off their entries' timestamps; only the Results date reads them now (prizes settled, rows archived).

### 3. Decisions already made
- Andrew (2026-10-21): launch now, not early March; skip 10.7. Don't re-ask.
- Partners can create bracket prizes from now on; a prize pays only brackets that lock after it is created.

### 4. Files changed
- `lib/legalInfo.ts` — `LEGAL_LAST_UPDATED` = "October 21, 2026".
- `docs/squares-and-brackets-plan.md` — status line, table rows 10.7/10.8, For-Andrew line, §27.
- `CLAUDE.md` — bracket bullet: launched, env values, rehearsal switch off. (Andrew's own uncommitted CLAUDE.md POS edit
  was left unstaged and uncommitted.)

### 5. Facts and traps
- With the flag on, the gates are date-only: card `SEASONAL_GAME_WINDOWS.bracket` (teaser Mar 1, open Mar 14 – Apr 6),
  sync `bracketsSyncMode` (window open), TV `isBracketsServerLive`, prize offer `isBracketPrizeOffered` (≤ Apr 6).
- `vercel env rm` / `pull` are denied; use `vercel env update NAME production` to change a value.
- A rehearsal now requires `BRACKETS_REHEARSAL_ENABLED=true` in Production again (server-side; no redeploy).

### 6. Build / test / verify
- `npx vitest run tests/brackets tests/bracket tests/seasonal tests/legal tests/lib.results-bracket` — 11 files, 191 pass.
- Production checks after deploy: see the commit's verification in the session (deployment Ready, `/rules` bracket
  section, `/bracket` no longer 404). Unverified: the partner wizard's bracket prize card on a phone (needs a partner
  login); the 10.7 checklist (skipped).

### 7. Open questions
- None.

### 8. First steps for 10.9 (Opus 5.5 · medium)
1. On Mar 14 evening, query `bracket_tournaments` (`purpose = 'live'`, season 2026).
2. Check region names, 32 R64 games each, opening-round links; use `link_opener` / `set_region_names` as needed.
3. Watch `/api/cron/*` logs for `[Brackets]` lines on Mar 18–21 and Apr 4–5.
