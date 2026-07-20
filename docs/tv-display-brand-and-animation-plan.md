# TV Display — Brand Alignment, Animation & Pairing — HANDOFF

> **Status:** Phases 0–11 shipped and wired in (Prompts A–I all live). **Phase 8 (real-browser verification), Phase 9 (reveal-phase backend), Phase 10 (Prompt I wired), Phase 11 (Category Blitz countdown) all DONE 2026-07-19** — see §0. The only remaining item is **Phase 12 (physical-device pass)**, which is hardware-only and not automatable — checklist ready at `docs/tv-display-physical-device-checklist.md`. Native TV apps (Phase 7) remain deferred. Owner: Andrew. Created 2026-07-18, last updated 2026-07-19.
>
> **Scope:** The public "follow-along" TV screen (`/venue/[venueId]/screen`), the TV pairing flow (`/tv`), and the Partner Dashboard surface that hands out the display URL.
>
> Companion docs: `SYSTEM_CONTEXT.md` §0, `docs/partner-dashboard-plan.md`, `docs/partner-dashboard-design.md`.

---

## 0. Status at a glance — READ THIS FIRST

### Done and wired into the live screen
| # | What | Component(s) | Wired into |
|---|---|---|---|
| Phase 0 | Brand tokens + motion foundation | `lib/venueScreenBrand.ts`, `components/venue-screen/ScreenTransition.tsx` | Used by every panel below |
| Phase 1 | Fixed `/tv` flash-then-bounce bug | `app/tv/page.tsx` (`booting` phase added) | Live |
| Phase 2 | Rebranded static screens to brand tokens | All `components/venue-screen/*` | Live |
| A | Live Trivia question reveal | `TvQuestionReveal.tsx` | `LiveTriviaScreen.tsx` |
| B | Live Trivia round-break leaderboard | `TvRoundBreak.tsx` | `LiveTriviaIntermissionScreen.tsx` |
| C | Live Trivia final standings/podium | `TvFinalStandings.tsx` | `LiveTriviaIntermissionScreen.tsx` |
| D | Category Blitz letter reveal | `TvLetterReveal.tsx` | `CategoryBlitzScreen.tsx` |
| E | Category Blitz round results | `TvBlitzResults.tsx` | `CategoryBlitzIntermissionScreen.tsx` |
| F | Idle/attract-mode carousel | `TvIdleAttract.tsx` | `IdleVenueScreen.tsx` |
| G | Pairing screen polish (real QR wired) | `TvPairingDisplay.tsx` | `app/tv/page.tsx` |
| H | Idle→live "We're live!" takeover | `TvGoLiveTakeover.tsx` | `VenueScreenClient.tsx` (client-side flip detection, no backend change needed) |

### Built AND wired in
| # | What | Component(s) | Wired into |
|---|---|---|---|
| I | Live Trivia correct-answer reveal | `TvAnswerReveal.tsx` → `LiveTriviaRevealScreen.tsx` | `VenueScreenClient.tsx` (renders on the new `"reveal"` phase). **Wired 2026-07-19 (Phase 10).** Backed by Phase 9's reveal-phase state (§5). |

### Phases 9–12 — DONE (2026-07-19)
- **Phase 9 (reveal-phase backend state):** `lib/venueScreen.ts`'s live-trivia branch now emits a `"reveal"` phase (mapped from the engine's `rest_warning` window), plus `correctAnswer: string | null` and `revealEndsAt: string | null`. **Security:** the engine already withholds `revealedAnswer` until answers lock (it's null during `answering`); `selectVenueScreenState` gates a **second** time — `correctAnswer`/`revealEndsAt` are non-null **only** on `phase === "reveal"`, so the answer never rides along on a question/intermission/final payload. Two unit tests lock this in (one asserts the reveal surfaces the answer + deadline; one asserts a forced `revealedAnswer` never leaks on a `question` payload). Poll cadence: `reveal` joins `question` in the 1s-poll tier.
- **Phase 10 (wire Prompt I):** `LiveTriviaRevealScreen.tsx` wraps `TvAnswerReveal` (15s hold mirroring `REST_WARNING_MS`); `VenueScreenClient` renders question→`LiveTriviaScreen`, reveal→`LiveTriviaRevealScreen`, else intermission/final→`LiveTriviaIntermissionScreen`. Verified in-browser: full question→reveal→intermission sequence drives cleanly (mocked polls), zero errors, 0 remounts while static, and the standalone reveal renders correctly in both motion modes.
- **Phase 11 (Category Blitz `secondsRemaining` gap):** results/intermission no longer hardcode `0`. Added a shared `nextRoundStartAtMs` anchor to `lib/categoryBlitzShared.ts` (`scored_at + intermission`, with continuous vs scheduled timing) — the client `categoryBlitzRealtime` copy was collapsed into it to kill the drift risk. `getCategoryBlitzInput` computes `nextRoundStartsAt` for the active session; `selectVenueScreenState` counts down to it. Verified: `TvBlitzResults` now shows a real "next letter in" countdown (e.g. 149s), not a red 0.
- **Phase 12 (physical-device pass):** checklist authored at `docs/tv-display-physical-device-checklist.md` — on-site/hardware-only items (real-panel color, 10-ft legibility, QR scan distance, TV-remote pairing, multi-hour burn-in). Must be run by someone with the hardware; not automatable.

### Phase 8 — real browser verification: DONE (2026-07-19)
Every panel (Live Trivia question/round-break/final-standings, Category Blitz letter-reveal/results, idle attract) and the `/tv` pairing flow were driven in headless Chromium at 1920×1080, in both normal and `prefers-reduced-motion`, against a temporary debug-mode broadening (reverted after). Results:
- **All panels render with zero console/page errors** in both motion modes.
- **Poll-idempotency confirmed**: a MutationObserver over ~9s (multiple 1s/4s poll ticks) recorded **0 panel remounts** for question/round/round-break — animations fire once per identity, never on the poll tick.
- **`/tv` flow confirmed**: fresh visit shows the neutral "Setting up this display…" splash then the pairing display + real QR — **no flash-then-bounce** (Phase 1 fix holds); a pre-paired TV shows "Resuming…" and redirects to its venue screen. Zero errors.
- **Idle→live "We're live!" takeover (H) confirmed**: driven by mocking the poll API (idle → live-trivia across two polls); the takeover fires once, animates, and completes cleanly; it does *not* re-fire on reload into an already-live game.
- **3 layout bugs found and fixed** (all pre-existing, surfaced because the panels are mounted *below* the shared 148px `VenueTitle` header — they were authored assuming a full 1080 canvas):
  1. `TvFinalStandings` — the `absolute bottom-44` runner-up strip (ranks 4–6) rode up into the fixed-height podium and overlapped it at *every* player count. Reworked to a fitted flow layout (root stays block, podium fixed 520, strip in normal flow; internal header trimmed 104→84 / pad 56→28) so podium and strip stack cleanly.
  2. `TvRoundBreak` — with 7–8 players, ranks 7–8 rendered entirely below the viewport. Compacted the oversized header (title 132→88, countdown 148→112, paddings) and row heights (104/88 → 86/72) so all 8 rows (`maxRows` default) fit in 1080.
  3. `TvBlitzResults` — same 7–8-row overflow. Compacted the letter glyph (196→150), title (96→84), countdown (136→108), and rows (100/86 → 84/72). All 8 rows now fit.
- **Not verified here (needs real hardware):** physical Smart-TV/Chromecast render, QR scan-ability across a room, multi-hour burn-in — that's Phase 12.

### Not started
- **Phase 7 — native TV apps.** Future, not started, not currently prioritized.
- The `lib/venueScreen.ts` backend addition Prompt I needs (§5).

### Known gaps to carry forward
- **Category Blitz's `secondsRemaining` is hardcoded to `0` for any non-`"round"` phase** in `lib/venueScreen.ts` (`roundIsActive ? secondsUntil(...) : 0` — pre-existing, not touched this session). Result: `TvBlitzResults`'s "Starting in" / "Next letter in" countdown always displays **0s** instead of a real countdown. Live Trivia's equivalent field is already computed correctly. Worth fixing alongside or before the Prompt I backend work, since both touch the same file.
- Countdown animations across A/B/D/E run at **1s cadence** (reusing `VenueScreenClient`'s existing ticking clock) rather than the 80–90ms cadence the Web UI originals used — a deliberate architectural simplification (see §4), slightly less buttery-smooth than the Web UI previews but functionally correct and consistent everywhere.
- `ScreenPodium.tsx`, `ScreenConfetti.tsx`, and `ScreenLeaderboard.tsx` (all under `components/venue-screen/`) were built as Phase-3 stopgaps **and then deleted** once the Web UI components (C's podium/confetti, B/E's leaderboards) superseded them. If you see references to them in old context/history, they no longer exist — don't recreate them.

---

## 1. What to do next — phased, with model + effort

| Phase | Goal | Key work | Model | Effort |
|---|---|---|---|---|
| ~~**8**~~ ✅ | Real browser verification | **DONE 2026-07-19 — see §0.** Drove every panel + `/tv` flow in headless Chromium (motion + reduced-motion) via a temporary debug-mode broadening; confirmed zero errors and poll-idempotency (0 remounts). Found & fixed 3 pre-existing full-canvas-layout bugs (final-standings overlap; 7–8-row overflow in round-break & blitz-results). Physical-device pass deferred to Phase 12. | — | Done |
| ~~**9**~~ ✅ | Backend: reveal-phase state | **DONE 2026-07-19 — see §0.** `lib/venueScreen.ts` emits `"reveal"` (from the engine's `rest_warning`) + double-gated `correctAnswer`/`revealEndsAt` (present only on reveal). Two unit tests, incl. a no-leak-on-question test. | — | Done |
| ~~**10**~~ ✅ | Wire Prompt I in | **DONE 2026-07-19.** `LiveTriviaRevealScreen` wraps `TvAnswerReveal`; wired into `VenueScreenClient`. Browser-verified through a full question→reveal→intermission sequence. | — | Done |
| ~~**11**~~ ✅ | Fix Category Blitz `secondsRemaining: 0` | **DONE 2026-07-19.** Shared `nextRoundStartAtMs` anchor (`scored_at + intermission`) drives a real results/intermission countdown; client copy de-duplicated. | — | Done |
| ~~**12**~~ 🔲 | Physical device pass | **Checklist ready:** `docs/tv-display-physical-device-checklist.md`. Hardware-only (real-panel color, 10-ft legibility, QR scan distance, TV-remote pairing, multi-hour burn-in). Andrew / on-site person executes. | **Opus 4.8** (prep done) | Manual time |
| **7** *(future, unchanged from original plan)* | Native TV apps | Amazon/Google/Apple TV apps, on-device pairing. Not prioritized. | Opus 4.8 | High |

Recommended order was **8 → 9 → 11 → 10 → 12**; 8–11 are complete, only the hardware-only Phase 12 remains (7 deferred indefinitely).

---

## 2. Architectural decisions & gotchas (read before touching this code)

These aren't obvious from the diffs alone — worth knowing before making further changes to `components/venue-screen/*`:

- **This repo's hooks lint is stricter than typical Next.js projects** (React Compiler–era rules). It forbids: (a) calling `Date.now()` — or any impure function — anywhere in a component's render body, **including inside `useMemo`**; (b) reading or writing a `ref.current` during render (only inside effects/callbacks is safe); (c) calling `setState()` directly and unconditionally at the top of an effect body (the "you might not need an effect" anti-pattern). Every Web UI-authored component in this batch used at least one of these patterns for local countdown timers — all were rewritten.
- **The fix pattern, applied consistently across A/B/D/E:** don't run a local `Date.now()` interval per panel. Instead accept `nowMs` (prop, threaded down from `VenueScreenClient`'s single existing 1s-ticking clock) and `updatedAtMs` (`state.updatedAt`, the server timestamp the payload was computed at), and derive `live = secondsRemaining - (nowMs - updatedAtMs) / 1000` — pure arithmetic on props, zero timers of its own. For "remember the first-seen value for this identity" (e.g. a countdown's total duration), use React's *adjust state during render* pattern (`useState` + a conditional `setState` call directly in the render body when a derived "key" changes) instead of a mutated `useRef`.
- **Category Blitz's on-brand color is fuchsia → violet, not emerald.** Confirmed by `--ht-game-blitz` in `app/globals.css` and `CATEGORY_BLITZ_THEME` in `lib/venueScreenBrand.ts`. The *original* pre-existing venue screen had this backwards (emerald), and this doc's own §4 prompt-authoring preamble (below) inherited that mistake before the correction was discovered. Prompts D, E, and H were all recolored from their as-authored emerald/mixed palettes to fuchsia/violet during integration. If you author further Category Blitz prompts, tell the Web UI fuchsia→violet explicitly rather than trusting §4's preamble text.
- **The "We're live!" takeover (H) fires without any backend change**, by design: rather than the originally-authored `startedAt`/`Date.now()`-based staleness guard (which hits the purity rule above), `VenueScreenClient` tracks game mode across polls in a plain closure variable (same pattern as its existing `currentState`/`failures` tracking) and only mounts `TvGoLiveTakeover` when it client-detects a genuine `idle → live` transition on a poll **after the first** — so a page reload straight into an already-live game never re-fires it. `TvGoLiveTakeover` itself is now a fully pure, stateless, framer-motion-only sequence; all "when to fire / when to stop" logic lives in the caller.
- **`questionType` (question font-size-by-length scaling) is shared** between `TvQuestionReveal` (A) and `TvAnswerReveal` (I, unwired) via `lib/tvType.ts` — extracted proactively so the two can't drift apart, per a risk the Prompt I author flagged themselves. If you add more Live Trivia TV components that render the question text, use this helper.
- **Venue name is shown once**, by `VenueScreenClient`'s shared header (`VenueTitle`), never repeated inside individual panels — several of the as-authored Web UI components included their own venue-name line; those were stripped during integration.

---

## 3. How the system works (background, unchanged since original planning)

### The pieces that already exist

| Piece | Path | What it does |
|---|---|---|
| TV pairing page | `app/tv/page.tsx` (`hightopchallenge.com/tv`) | Public page a TV browser opens. Mints a code, shows a QR, polls until claimed, then redirects itself to its venue screen. |
| Pairing backend | `lib/tvPairing.ts`, `app/api/tv-pair/*` | Mints/claims/polls short-lived, single-use codes stored in `tv_pairing_codes`. |
| Owner claim | `app/owner/display/page.tsx` + `app/api/owner/tv-pair` | Partner enters/scans the code from their phone; server verifies venue ownership, then binds that code → their `venueId`. |
| The actual TV screen | `app/venue/[venueId]/screen/page.tsx` → `components/venue-screen/VenueScreenClient.tsx` | The across-the-room display. Polls `/api/venue-screen/state`, renders Idle / Live Trivia / Category Blitz panels. |
| Screen state | `lib/venueScreen.ts` | Server derives the current mode + phase (`live-trivia`: question / intermission / final; `category-blitz`: round / intermission / results; `idle`). |

### The end-to-end pairing flow

1. Partner opens **`hightopchallenge.com/tv`** on the TV (browser only today — no native app exists).
2. The TV **mints its own unique 6-character code** (`lib/tvPairing.ts`, Crockford base32, 10-min TTL, single-use) and shows it + a QR (real QR now, via `qrcode.react`'s `QRCodeSVG`, wired through Prompt G's `renderQr` callback).
3. On their phone, the partner opens **Partner Dashboard → Venue Display** (or scans the QR) and submits the code. The server checks they own the venue and binds `code → venueId`.
4. The TV is polling; it sees `claimed`, caches `venueId` in the TV browser's `localStorage`, and redirects itself to `/venue/{venueId}/screen`.
5. From then on the screen polls `/api/venue-screen/state` every 3s and shows whatever live game is running at that venue. A power-cycled TV auto-resumes from `localStorage` — no re-pairing.

Each TV mints its own fresh, unique, short-lived code — it is **not** a shared per-venue identity, so two venues opening `/tv` simultaneously never collide.

Per `SYSTEM_CONTEXT.md` §0: `/tv` and `/owner/display` stay marketing-classified (apex host even after the domain split); the venue screen lives on the `play.` host.

---

## 4. Reference: the original Web UI prompts (A–I)

Kept for history / in case any prompt needs re-authoring. **Note the emerald/Category-Blitz correction in §2** before reusing the shared preamble below.

> Shared preamble originally used for every prompt:
>
> *"You're writing a single self-contained React + TypeScript component using `framer-motion@12` and Tailwind CSS for a **10-foot TV 'follow-along' display** (across-the-room, no user interaction, ~1920×1080). Brand: dark canvas `#020617`; brand colors — cyan `#06b6d4`/`#22d3ee`, emerald `#10b981`/`#34d399`, amber `#f59e0b`/`#fbbf24`, violet `#7c3aed`; Live Trivia uses a cyan→blue→violet gradient, Category Blitz uses emerald ⚠️ **stale — Category Blitz is actually fuchsia→violet, see §2**. Huge type, high contrast, bold weights. **Critical:** the parent re-renders on a 3-second poll and passes new props; the component must be driven by prop changes (a `phase`/`round`/`questionId` key), play its animation once per change, and be safe to re-mount — no reliance on clean lifecycle events. Honor `prefers-reduced-motion` with a static fallback. Return one component with a small demo harness (Artifact) so I can preview it."*

| Prompt | Purpose | Status |
|---|---|---|
| A | Live Trivia question reveal | ✅ wired |
| B | Live Trivia round break | ✅ wired |
| C | Live Trivia final winners | ✅ wired |
| D | Category Blitz letter reveal | ✅ wired |
| E | Category Blitz round results | ✅ wired |
| F | Idle attract | ✅ wired |
| G | Pairing polish | ✅ wired |
| H | Idle→live "We're live!" takeover | ✅ wired |
| I | Live Trivia answer reveal | ⛔ built, not wired — needs `lib/venueScreen.ts` change (§1.2) |

Full prompt text for each (A–I) is preserved in git history of this file if needed for re-authoring; trimmed here to keep the handoff doc scannable. Ask Andrew or check `git log -p -- docs/tv-display-brand-and-animation-plan.md` for the original wording.

---

## 5. Prompt I backend — SHIPPED (Phase 9, 2026-07-19)

`lib/venueScreen.ts`'s `VenueScreenState` (live-trivia branch) now has exactly the scoped shape:

```ts
liveTrivia: {
  phase: "question" | "reveal" | "intermission" | "final";  // "reveal" maps from engine rest_warning
  // ...existing fields...
  correctAnswer: string | null;   // non-null ONLY on phase === "reveal"
  revealEndsAt: string | null;    // ISO; non-null ONLY on phase === "reveal"
}
```

**How the gating actually works (two layers):**
1. The engine (`lib/liveShowdownEngine.ts`) never puts the answer on the public question object (`LiveShowdownQuestionPublic` has no `correctAnswer` field) and only populates the separate `revealedAnswer` once `activePhase !== "answering"` — i.e. after answers lock.
2. `selectVenueScreenState` gates a **second** time: `correctAnswer`/`revealEndsAt` are computed as `phase === "reveal" ? … : null`, so even if `revealedAnswer` is set (it also is during intermission/final), the answer only ever appears on a `reveal` payload. Test `"never leaks the answer on a question payload even if the engine set revealedAnswer"` locks this in.

`TvAnswerReveal.tsx` is wired via `LiveTriviaRevealScreen.tsx` (Phase 10).

---

## 6. Verification checklist

- [x] Live Trivia question → round-break → final-standings rendered in a browser (via debug-mode broadening; all three panels, motion + reduced-motion, zero errors). **Fixed final-standings overlap + round-break 8-row overflow.**
- [x] Category Blitz letter-reveal → results rendered in a browser. **Fixed blitz-results 8-row overflow.**
- [x] Idle carousel drift/breathing don't reset across reload — burn-in transform is a pure `nowMs`-derived function (`getVenueScreenBurnInTransform`), carousel keyed on identity, so a reload lands on the same computed frame, not a reset.
- [x] `prefers-reduced-motion` pass across all panels (all render statically, zero errors).
- [x] Poll-idempotency: 0 panel remounts observed over multiple poll ticks.
- [x] `/tv` pairing flow: fresh mint → real QR + code tiles, **no flash-then-bounce**; pre-paired auto-resume redirects to venue screen. (Full owner-claim → redirect leg needs owner auth; the mint/display/no-bounce/resume legs are confirmed.)
- [x] **idle→live "We're live!" takeover** — verified by mocking the poll API (Playwright `page.route`): first poll returns `idle`, next returns `live-trivia`. The takeover mounted, ran its sweep + "We're live" title, and completed with zero errors. The reload-into-already-live case doesn't fire (SSR sets `previousMode` to the live mode, so the first poll is not a flip) — corroborated by every other panel screenshot being takeover-free.
- [x] **Answer-reveal beat (Prompt I / Phase 10)** — renders in both motion modes (zero errors); full question→reveal→intermission sequence drives cleanly via mocked polls with 0 remounts while static.
- [x] **Reveal-answer gating (Phase 9)** — unit-tested: answer + deadline appear only on `phase === "reveal"`; a forced `revealedAnswer` never leaks on a `question` payload.
- [x] **Category Blitz results/intermission countdown (Phase 11)** — `TvBlitzResults` shows a real "next letter in" value (verified 149s via mocked results), not a stuck 0.
- [ ] Physical TV / Smart-TV browser or Chromecast pass (Phase 12; can't be automated). **Checklist:** `docs/tv-display-physical-device-checklist.md`.
