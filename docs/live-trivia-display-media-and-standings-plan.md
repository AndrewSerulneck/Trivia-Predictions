# Live Trivia Display: question pictures (and future video) + honest "Standings next"

**Status (2026-11-20):** Phases 1–4 built, reviewed and browser-verified; Phase 5 found and fixed one bug (a
broken picture showed a broken-image icon on the TV). Branch `fix/tv-question-media-standings`, PR open, **not
merged or deployed**. Left: Andrew merges → check the deploy → check on a real TV during a game. Handoff:
`docs/live-trivia-display-media-and-standings-plan_PHASE_5_HANDOFF.md` (the Phase 4 handoff named here earlier was
never written; the Phase 5 note covers Phases 1–5). Phase 6 is future work.

## 1. The problems (found 2026-11-20)

1. **Pictures missing on the Display URL.** Phones get `activeQuestion.imageUrl` from the Live Trivia engine,
   but the display's state builder (`selectVenueScreenState` in `lib/venueScreen.ts`) copied only the question
   text into the `live-trivia` payload. So the TV never knew there was a picture. 335 Live Trivia questions have an
   `image_url` (maps on `/maps/*.svg|png`, Wikimedia JPGs, Unsplash photos).
2. **"Standings next" with no standings.** The answer-reveal panel (`TvAnswerReveal`) always said "Standings next",
   but it runs after **every** question. Standings (the round break, `TvRoundBreak`) appear only after question 15 of
   a round (engine: 15 questions × 75 s, then an 8 m 45 s break). After questions 1–14 the next screen is the next
   question. Also, when nobody has scored yet, the round-break and final boards were blank, and recent production
   games had only 1–2 players.

## 2. Decisions (Andrew, 2026-11-20)

- **D1 Standings:** fix the label, don't add per-question standings. "Next question" after questions 1–14,
  "Standings next" after 15, "Final standings next" after the last question of the last round. Empty board says
  "No scores yet." No new database reads.
- **D2 Picture during the reveal:** keep it up, smaller, beside the answer.
- **D3 Future video/GIF:** plays on the **TV and phones**, muted and looping (like a GIF).
- **D4 Answer-in-file-name** (e.g. `/maps/geography-map-texas.png`): Andrew judged it not a real risk in a 60-s
  window; just make question pictures **not clickable** (no long-press menu, no drag, no tap). No file renames.

## 3. Design

- **One media type, one helper:** `lib/questionMedia.ts` turns a stored URL into
  `QuestionMedia = { kind: "image" | "video"; url; credit; fit: "contain" | "cover" }`, or null for anything that
  isn't an `http(s)` or root-relative URL. Kind comes from the file extension today (`.mp4/.webm/.m4v/.mov` →
  video; everything else, including `.gif`, → image). The credit/fit rules that lived in `QuestionImage` and the
  live page move here unchanged.
- **The display payload** gains `liveTrivia.media` (question and reveal phases only; always null on intermission
  and final), plus `questionIndex` and `questionsPerRound` so the reveal can pick its label. The engine is not
  changed; `image_url` is already read by `loadSessionQuestion`, so there is **no new read**.
- **Renderers:** `components/venue-screen/TvQuestionMedia.tsx` on the TV (fixed-size frame so `AutoScaleToFit`
  never re-measures on load; a broken URL hides the frame instead of showing a broken icon); `QuestionImage`
  (phones, Live + Speed Trivia) renders the same type. Video is `muted autoPlay loop playsInline`, no controls.
  Both are non-interactive (`pointer-events-none`, `select-none`, no drag, no iOS touch callout).
- **Copy:** "Next question", "Standings next", "Final standings next", "No scores yet." Nothing else new.

### Cost
No new database reads, cron, poll or paid API. The display payload grows by ~150 bytes per poll (1 poll/s per TV
during a question). Each TV downloads a question's picture once (maps ≈ 20–200 KB) — the same as one more phone.
Video (Phase 6) is the first thing with real bandwidth cost: a 2 MB clip × 50 phones + 1 TV ≈ 100 MB per question,
so Phase 6 must estimate it before the first clip ships.

## 4. Phases

| Phase | What | Model / effort | Why |
|---|---|---|---|
| 1 | `lib/questionMedia.ts`; display payload carries `media`, `questionIndex`, `questionsPerRound`; debug mode sample; tests | Claude Opus 5.5 / medium | Touches the display selector next to its answer-security gate; small but shared. |
| 2 | TV renders the picture/video on the question view (side by side) and smaller beside the answer | Claude Sonnet 5.5 / high | Well specified UI, but a fixed-canvas layout with the venue-screen standing rules (auto-fit, hydration-safe reduced motion). |
| 3 | Phones render the shared media type (image or muted looping video), not clickable; Speed Trivia gets it free | Claude Sonnet 5.5 / medium | Well specified UI. |
| 4 | Reveal label by question number; "No scores yet." on empty round-break/final boards | Claude Sonnet 5.5 / medium | Copy + small UI logic. |
| 5 | Browser-check every phase from a scratchpad clone with mocked state; full test/lint/typecheck/build; PR; deploy after Andrew merges; check on a real TV during a game | Claude Sonnet 5.5 / medium | Verification and release, no new design. |
| 6 (future) | First GIF/video content: hosting (Vercel Blob or Supabase Storage), size budget, bandwidth estimate, a `mediaUrl` field in Live Trivia JSON + sync script, admin preview; convert GIFs to MP4 | Claude Opus 5.5 / high | Data/schema change and a recurring bandwidth cost. Start only when the first clip is ready. |

Phases 1–4 were built in one session (2026-11-20); one handoff note covers them.

## 5. Standing rules (2026-11-20)

- The display payload carries a question's media only on the `question` and `reveal` phases, never on
  `intermission`/`final`; media is derived only through `toQuestionMedia` (`lib/questionMedia.ts`).
- A broken or unsupported media URL hides the frame; the question still shows. Never a broken-image icon on a TV.
  The Display URL is server-rendered, so a file can fail before React listens: media elements also check their
  state when they mount (`checkImage` / `startMutedLoop` in `TvQuestionMedia`; `complete`/`readyState` in
  `QuestionImage`). Never rely on `onError`/`onLoad` alone for question media.
- Question media is never clickable, draggable or long-pressable, on any screen.
- Video plays muted and looping on both TV and phones (D3); never with controls.
- The answer reveal never promises standings unless the next screen shows them (`revealNextLabel` in
  `lib/liveTriviaShared.ts`).
- Pinned by `tests/live-trivia-display-media-contract.test.ts` and `tests/lib.questionMedia.test.ts`.
