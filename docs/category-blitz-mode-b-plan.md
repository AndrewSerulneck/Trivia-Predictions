# Category Blitz — "Blend In!" Mode Implementation Plan

> **Self-contained brief.** Reference this doc in a fresh chat to start building without
> re-deriving context. Read `SYSTEM_CONTEXT.md` and the "Category Blitz Source of Truth"
> section of `CLAUDE.md` first. Canonical engine: `lib/categoryBlitz.ts`.

---

## 1. Why this exists (the problem)

Some Category Blitz categories are broken because a player can name the most **obscure**
answer possible and still score. This happens with **subjective / fame-based** categories
like "A famous actor" or "A famous scientist": the field of acceptable answers is effectively
unlimited, so an obscure answer is both *unique* (scores in the normal round) and *technically
valid* (passes Haiku's Is-A test). That makes the round un-fun.

## 2. The core insight — what "the flip" actually is

Instead of banning these categories, we invert the scoring rule for them on certain rounds.
This inversion is the entire feature — there is **no named "mode" system for players to
learn**. Players never see a mode name. They only see:
- **the puck** (top-right corner) telling them the current goal, and
- **a full color/vibe shift** on the flipped rounds.

- **Normal rounds (exist today):** you score by being **unique**. Grading is objective (the
  "Is-A" test via Haiku). Obscurity is *rewarded* — which is exactly why subjective categories
  break. Puck reads **"Be Unique!"**.
- **Flipped rounds (new):** you score by being **the crowd** — Family-Feud style. The *more*
  players who gave your answer, the more points it's worth. Obscurity is now **punished**;
  consensus wins. Puck reads **"Blend In!"**.

"Blend In!" fits subjective categories perfectly: "an annoying rapper" cannot be graded
objectively, but it *can* be graded by popular agreement. The flip changes the scoring rule,
the win condition, and the vibe all at once — a legible switch, not a reskin. On flipped
rounds, Haiku's job changes from **"is this valid?"** to **"is this safe and on-topic?"** —
which is where the anti-bigotry rule lives.

**No player-facing mode names.** Internally the code may use plain, boring identifiers
(`standard` / `reverse`) purely as enum values — these must never appear in any UI copy,
toast, tooltip, or animation. The puck label and the color world ARE the only signal a player
gets. Do not invent or surface a marketing name like "Hive Mind" or "Standout" anywhere in the
product.

## 3. Product decisions (locked defaults — override in Phase 0 if desired)

- **No mode names shown to players — ever.** The only player-facing signals are the puck
  label and the ambient color/theme shift (§4). Internal code enum: `standard` | `reverse`.
- **Puck labels:** side A = **"Be Unique!"**, side B = **"Blend In!"**. These MUST be trivial
  to change — a single constant, not scattered strings (see §5).
- **Cadence:** every **4th** round is a "Blend In!" round — deterministic
  `roundIndex % 4 === 3` (indices 3, 7, 11…). One flag flips this to random-25% later.
- **Overlap allowed:** categories carry a `modes` tag array (`["A"]`, `["B"]`, or
  `["A","B"]`). The two lists are **not** mutually exclusive.
- **Consensus needs a crowd:** the existing `<3 players → no scoring` gate already protects
  "Blend In!" rounds (consensus is meaningless solo). It degrades gracefully.
- **Moderation is a hard gate:** any answer Haiku flags as racist, bigoted, misogynistic,
  political, or harassing scores **zero** and is **suppressed** from the reveal (never shown
  back to the room). Moderation **fails closed** (uncertain → no score), unlike the normal
  round's validity check, which fails open.
- **Scoring curve — LOCKED:** in a "Blend In!" round, an answer is worth **exactly 1 point per
  player who gave that same (normalized) answer**, uncapped. If 5 players all say "Adele," each
  of those 5 players scores 5 points for that category. If you're the only one who said your
  answer, you score 1 point. There is no separate uniqueness bonus and no cap — bigger
  consensus always means more points, without ceiling. This is explicitly a **comeback
  mechanic**: a player behind on the leaderboard can out-score a normal round by reading the
  room correctly on a popular answer.

## 4. The visual language of the flip (REQUIRED — must be unmistakable)

When the mode changes, players must *immediately* know the goal flipped, with **no reliance on
players remembering a mode name**. Three coordinated cues, all keyed off the puck label /
color world — never off a name:

### 4a. The Craps Puck (top-right corner) — the persistent indicator
- A casino craps-style **ON/OFF puck** pinned to the top-right corner of the game surface,
  visible during active play.
- Two faces:
  - **Normal-round face:** label **"Be Unique!"** (default styling: cool/blue, "OFF"-puck feel).
  - **Flipped-round face:** label **"Blend In!"** (hot/magenta-gold, "ON"-puck feel).
- On a mode change it **physically flips** (coin/puck flip) to the other face. This is a small,
  always-on animation distinct from the full-screen takeover.
- Labels live in ONE config object so they're changeable in seconds (see §5).

### 4b. Full-screen flip takeover — the announcement
- A ~2.5s Framer-Motion full-screen takeover fired on `round_started` when the mode differs
  from the previous round. The whole screen flips/inverts, shows the **puck label large**
  ("BLEND IN!") + a one-line rule ("Match the crowd — the more players who say it, the more
  it's worth"), then dissolves into the board. No separate "mode name" wordmark — the puck
  label itself is the hero text.
- Modeled on the existing `components/animations/CategoryBlitzChampionAnimation.tsx` pattern.

### 4c. Ambient theme shift — the sustained background cue
- The whole board's accent + **background** shifts for the duration of a "Blend In!" round: a
  distinct color world (e.g. deep magenta/violet canvas + gold accent) vs. the normal round's
  standard blue. This stays for the entire round so a player who missed the takeover still
  sees they're in a different mode.
- All colors flow through `lib/themeTokens.ts` per the brand-centralization rule — **no
  hardcoded colors in components.**

## 5. Changeability contract (do this so copy tweaks are painless)

Create a single source for mode presentation, e.g. `lib/categoryBlitzModes.ts`. Note there is
**no `wordmark` field** — we deliberately do not surface a mode name anywhere:

```ts
export type CategoryBlitzMode = "standard" | "reverse"; // internal only, never rendered

export const MODE_CONFIG: Record<CategoryBlitzMode, {
  puckLabel: string;      // "Be Unique!" / "Blend In!" — the ONLY hero text shown to players
  rule: string;           // one-line instruction shown in takeover + board header
  themeKey: string;       // key into themeTokens color set
}> = {
  standard: { puckLabel: "Be Unique!", rule: "Only unique answers win points — be original.",      themeKey: "blitzStandard" },
  reverse:  { puckLabel: "Blend In!",  rule: "Match the crowd — popular answers win.", themeKey: "blitzReverse"  },
};

// Cadence knob — flip to a random-25% strategy later without touching startRound.
export const isReverseRound = (roundIndex: number) => roundIndex % 4 === 3;

// Points for one submission in a "reverse" round: 1 pt per player who gave the
// same normalized answer, uncapped.
export const reverseRoundPoints = (matchingPlayerCount: number): number => matchingPlayerCount;
```

Every UI string above is read from this object — never inlined into components. If you want
to change "Blend In!" to something else later, it's a one-line edit here and nowhere else.

---

## 6. Phased plan

**Effort:** XS (<1hr) · S (~half day) · M (~1–2 days) · L (~3–5 days).
**Runtime model** = Claude model running in production. **Build model** = model used to do the work.

### Phase 0 — Lock puck labels & config scaffold
Confirm puck labels (currently "Be Unique!" / "Blend In!" — you said not fully sold on these
yet, so treat as placeholder). Create `lib/categoryBlitzModes.ts` (§5) as the single config
surface, including the locked `reverseRoundPoints` formula. Decision + one small file.
- **Runtime model:** none · **Build model:** Sonnet 5 · **Effort:** XS

### Phase 1 — Content: tag "Blend In!" categories
Add a `modes` field to entries in `data/category-blitz/category-pool.json`; author the seed
list of subjective categories ("a famous singer", "an overrated movie", "an annoying
rapper"…). Extend `scripts/build-category-blitz-letter-index.cjs` to emit a **second index**
(`bLetters` / `bUsableLetters`) built only from B-tagged categories. The letter-coverage bar
can be looser for these categories (answers need popularity, not objective validity).
- **Runtime model:** Opus 4.8 (offline abundance/curation pass — matches existing build pipeline)
- **Build model:** Sonnet 5 · **Effort:** M

### Phase 2 — Data model & round selection
New migration: add `mode text not null default 'standard'` to `category_blitz_rounds`
(`standard` | `reverse` — internal values only, never rendered). In `startRound`
(`lib/categoryBlitz.ts`), compute the round index from the prior-round count, call
`isReverseRound(index)`, and draw the board from the B-index for that letter when reverse. Add
`mode` to the `round_started` broadcast payload, the `CategoryBlitzRound` type
(`types/index.ts`), and the row/domain mappers.
- **Runtime model:** none · **Build model:** Sonnet 5 · **Effort:** M

### Phase 3 — Scoring engine: consensus + moderation
Branch `scoreRound` (`lib/categoryBlitz.ts`): for `reverse` rounds, replace the uniqueness
logic with **consensus tallying** — group submissions per category by normalized answer, and
award each submission `reverseRoundPoints(matchingPlayerCount)` = exactly the count of players
who gave that same answer, uncapped. Swap the Haiku prompt from the Is-A validity judge to a
**safety/on-topic moderator** that rejects racism, bigotry, misogyny, political speech, and
harassment → 0 pts + suppressed from reveal. Keep the existing retry/timeout/chunk harness, but
**fail closed** for moderation (uncertain → don't score). Add new reason codes
(`too_obscure`, `moderated`) to `submissionReason` / results mappers and the
`CategoryBlitzAnswerReason` type.
- **Runtime model:** Haiku 4.5 (moderation + on-topic judge)
- **Build model:** Opus 4.8 (moderation prompt is the highest-stakes design work) · **Effort:** L

### Phase 4 — The craps puck (persistent indicator + flip)
Build the top-right ON/OFF puck component reading `MODE_CONFIG[mode].puckLabel`. Wire it into
the game surface (`components/category-blitz/CategoryBlitzGame.tsx`). Animate a
coin/puck **flip** whenever `round.mode` changes between rounds. Labels + styling driven by
`lib/categoryBlitzModes.ts` and `lib/themeTokens.ts`. No mode name is ever rendered — only the
puck label.
- **Runtime model:** none · **Build model:** Sonnet 5 · **Effort:** M
- **→ Claude web-UI prompt provided** (§7b) to prototype the puck-flip look first.

### Phase 5 — In-game theme shift + instruction copy
When `round.mode === 'reverse'`, shift the accent **and background** to the "Blend In!" color
world for the whole round, and swap the board's instruction line to `MODE_CONFIG[mode].rule`.
Restyle the reveal so a matched answer glows **brighter** the more players hit it (consensus
made visible, reinforcing the "1 pt per matching player" payout). All via `lib/themeTokens.ts`
— no hardcoded colors.
- **Runtime model:** none · **Build model:** Sonnet 5 · **Effort:** M

### Phase 6 — Full-screen flip announce animation
Framer-Motion full-screen takeover on `round_started` when the mode flips: the whole screen
flips/inverts, shows the puck label large ("BLEND IN!") + rule line, ~2.5s, then dissolves to
the board. No separate mode-name wordmark. Model on `CategoryBlitzChampionAnimation.tsx`.
- **Runtime model:** none · **Build model:** Sonnet 5 · **Effort:** M
- **→ Claude web-UI prompt provided** (§7a) to approve the look before porting to Framer Motion.

### Phase 7 — Hardening, tests, simulation
Extend `scripts/simulate-category-blitz.cjs` to exercise reverse rounds, including asserting
the **1-point-per-matching-player payout** (e.g. 5 players matching → each scores 5); add
moderation red-team fixtures (slurs, dog-whistles, political names → all must score 0 +
suppress); unit-test `isReverseRound`; verify end-to-end with the `/verify` skill.
- **Runtime model:** Haiku 4.5 (in the sim) · **Build model:** Sonnet 5 · **Effort:** M

**Rough total:** ~2 weeks. Runtime cost impact is negligible — same one Haiku call per round,
a different prompt on 1-in-4 rounds.

---

## 7. Claude web-UI prompts (paste into claude.ai to prototype)

### 7a. Full-screen flip takeover (Phase 6)
> Build a single self-contained HTML file: a full-screen mobile-first game-mode-switch
> announcement animation. Dark theme (canvas `#020617`). It's for a Scattergories-style word
> game. Animate a dramatic ~2.5s "flip": the entire screen rotates/inverts on the Y axis, and
> as it lands it reveals a new color world (cool blues → a hot magenta/gold) with a large title
> reading **"BLEND IN!"** (Bree Serif) and a subtitle "Match the crowd — the more players who
> say it, the more it's worth." End by dissolving to transparent so a game board shows through.
> Inline CSS + JS only, no external assets. Make it feel like a physical card turning over.
> Give me 2–3 variations of the reveal.

### 7b. Craps ON/OFF puck flip (Phase 4)
> Build a single self-contained HTML file: a casino craps-style ON/OFF puck that lives in the
> top-right corner of a dark mobile game screen (canvas `#020617`). The puck is a round disc,
> ~64px. It has two faces: an "OFF"-style face (cool blue/slate, white text reading
> **"Be Unique!"**) and an "ON"-style face (hot magenta-gold, dark text reading **"Blend In!"**).
> Animate a satisfying ~0.8s physical **flip** that turns it from one face to the other — like a
> poker chip being flipped over — with a slight bounce/settle on landing. Include a button to
> toggle it so I can see the flip both directions. Inline CSS + JS only, no external assets.
> Give me 2 variations of the flip motion.

---

## 8. Key files (orientation for the build chat)

- `lib/categoryBlitz.ts` — engine: `startRound`, `scoreRound`, Haiku grading, results mappers.
- `lib/categoryBlitzModes.ts` — **NEW**, the mode-config single source of truth (§5).
- `lib/categoryBlitzShared.ts` — shared constants (durations, `answerStartsWithLetter`).
- `lib/categoryBlitzBroadcast.ts` — realtime broadcast payloads (`round_started`, etc.).
- `lib/categoryBlitzRealtime.ts` — client realtime state.
- `lib/themeTokens.ts` — brand color/token maps (add `blitzStandard` / `blitzReverse`).
- `components/category-blitz/CategoryBlitzGame.tsx` — main game surface (puck + theme + copy).
- `components/animations/CategoryBlitzChampionAnimation.tsx` — reference for the takeover.
- `data/category-blitz/category-pool.json` — canonical category library (add `modes` tags).
- `scripts/build-category-blitz-letter-index.cjs` — build (emit the B index).
- `data/category-blitz/CATEGORY_TEST.md` — category gates (canonical).
- `types/index.ts` — `CategoryBlitzRound`, `CategoryBlitzAnswerReason`.
- `scripts/simulate-category-blitz.cjs` — simulation harness for tests.

## 9. Open questions to resolve in Phase 0
1. Final puck labels — you flagged "Be Unique! / Blend In!" as not-yet-final. Confirm or
   revise before Phase 0 locks `lib/categoryBlitzModes.ts`.
2. Confirm no player-facing mode name is wanted anywhere (banner, tooltip, help text) —
   current plan treats this as a hard rule, not just a default.
3. "Blend In!" color world exact palette (needs a design token pair in `themeTokens.ts`).
4. Should a flipped round ever appear as the *first* round of a session, or only after round 1?
   (Default: only every 4th, so the first flipped round is round index 3.)
