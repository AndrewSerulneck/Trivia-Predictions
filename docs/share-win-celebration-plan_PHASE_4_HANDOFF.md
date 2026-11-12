# Share Your Win — Phase 4 handoff (the guide replacement clip)

## For Andrew (plain English)

**What changed:** the new guest-share clip for the Subscribe and Setup Guide is made, filmed from the real app.
A guest wins Live Trivia (the app's fireworks), opens Share Your Win, taps **Fireworks**, then **Lasers**, then
**Animated**. The moving Story plays big and ends on the still picture, and labels point at your business name,
social handle and address. Then she taps "Take a selfie instead". The real camera screen shows the AI guest you
picked (option 2) doing a peace sign. She captures it, adds Confetti, and posts it to her Instagram Story. Likes climb.

**Where:** `~/Documents/Hightop Challenge Advertising/Subscribe and Setup Guide/Guest Share Celebration clip 16x9.mp4`
and `… 9x16.mp4` (44 s, 60 fps, silent, new file names so CapCut won't play an old copy).

**Is it live?** It's a video file, not app code; nothing was deployed. The website and app are unchanged.

**Needs you:**
1. Watch both files. The captions are a first draft: WHEN GUESTS WIN… / THE APP PROMPTS THEM TO POST IT / THEY PICK
   THE CELEBRATION / AUTOMATICALLY TAGGED WITH YOUR BAR / OR SNAP A SELFIE / POSTED TO THEIR INSTAGRAM STORY / INSTANT
   FREE PUBLICITY. Tell the agent any wording or timing changes.
2. In CapCut: split v3 at **3:28.8** and **3:52.4**, delete the middle, and drop the clip in. Everything after it moves
   about 20 s later (the old scene was 23.6 s). The timing table for your voiceover is in the folder README, under
   "Guest Share Celebration clip".
3. The AI guest's photo has a chalkboard behind her that reads "TRIVIA NIGHT" (a generic sign, no brand). Say if you
   want it gone.
4. A scratch Canva design "Full-bleed selfie Instagram Story" was made in your Canva only to download the photo at full
   size. You can delete it.

**Cost:** none (no server, cron or paid API; one Canva image generation of three pictures).

---

## For the next agent

### 1. Goal and scope
Phase 4 is the last phase in the plan. The only follow-up is Andrew's review: caption wording, timing, and
re-rendering if he asks. **Out of scope:** editing `tutorial.html` (v3 stays the current cut) and re-rendering the whole guide.

### 2. Starting state
- Repo `main` at `46429ffc`. No app code changed. Uncommitted in the repo: this handoff and the plan's status line
  (doc-only). Unrelated untracked file left alone: `docs/cancelled-prizes-pick-windows-away-mode-plan_C1_BACKFILL_LOG_2026-11-09.json`.
- Nothing deployed, no data touched, no env vars.
- The scratch build is in this session's scratchpad (`…/scratchpad/app`, venue-uptown renamed to "Joe's Bar and Grill",
  no `.env*`). It was served on **port 3103**, because another process (PID 76978, not ours) held 3102. The scratchpad is temporary, so rebuild it to recapture.

### 3. Decisions made
- Andrew picked **AI guest option 2** (woman, string lights, trivia crowd; Canva media `MAHaqOLRQUU`), which fits the player "jessplays".
- Showed **Animated** (Phase 2 has shipped). Its frames are the app's real video, stepped through the sheet's `<video>`.
- Clip plays at its own speed (no `SPEED`), 44 s. The plan expected 35–40 s; the Animated beat added about 5 s.
- Selfie inherits Fireworks + Lasers from the design (real app behaviour); the clip adds **Confetti** on the selfie.
- Captions follow the plan's list, plus "POSTED TO THEIR INSTAGRAM STORY" for the Instagram beat (Andrew's call).
- Instagram stickers sit over the bottom fireworks, below the bar's panel, so they never cover the words or the face.

### 4. Files (all in `~/Documents/Hightop Challenge Advertising/`)
- `_Source (to remake clips)/guest-share-clip.html`: new page. Lines 1–573 are `tutorial.html`'s helpers + `igIcon`;
  then `sceneGuestShare` (timeline in its `seq`, `handOn`, `bigPic`, `captions`), `igStory` (draws the selfie),
  `animImg` (crops the sheet's video from `p-gshare-a###.png`, `VID` box), `CLIP_DUR = 44`.
- `_Source (to remake clips)/tutorial-player-capture.cjs`: new scene `gshare` (+ `PORT` env, + camera launch flags when
  `s.camera`). Backup of the old file: none kept outside the scratchpad. The diff is additive, and the old scenes are unchanged.
- `_Source (to remake clips)/make-y4m.cjs`: still PNG → Y4M 4:2:0 for Chromium's fake camera (sharp from the repo).
- `_Source (to remake clips)/ai-screens/guest-selfie-peace.png`: the AI guest, 1080x1920.
- `_Source (to remake clips)/tutorial-screens/p-gshare-*`: s0/s1/s2 (sheet: none → Fireworks → +Lasers), am0, a000–a149,
  cam0–cam3, post/post2, `design-fl.png` and `selfie.png` (full-size pictures the app made), `p-gshare.json` (tap boxes).
- `Subscribe and Setup Guide/Guest Share Celebration clip 16x9.mp4`, `… 9x16.mp4`.
- `README.md`: new Clips row + "Guest Share Celebration clip" section (timing table, how to remake).
- Memory notes `reference_advertising_clips_folder.md`, `project_share_win_celebration.md` updated.

### 5. Facts and traps
- **Canva `generate-image` returns only a 112x199 thumbnail**, and its media URLs are signed (403 if resized). To get
  full size: `create-design` (Instagram Story) → `read-design open_transaction` → delete elements + `insert_fill` the media at
  0,0,1080,1920 → `commit` → `export-design` png 1080x1920 → curl the URL.
- Playwright's Chromium **can** encode the Animated Story (the Motion toggle shows; about 10–20 s to encode). To get frames,
  pause the `<video>`, set `currentTime`, and await `seeked`.
- The selfie preview mirrors and the saved picture doesn't, so the peace sign switches sides between cam1 and cam2. This is the
  real app's behaviour.
- The captured selfie sits small in the sheet (the preview box is wide), which is why the clip shows `p-gshare-selfie.png` big beside it.
- The p-trivia-* win screens (Nov 5) still match the app: `p-gshare-post.png` was re-shot and is the same post-game card.
- `timeout` isn't on this Mac. zsh word-splitting: see the README traps.

### 6. Build / run / verify
- Capture: `PORT=3103 CAMERA_Y4M=<y4m> node tutorial-player-capture.cjs gshare` against the scratch build
  (`NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED=1 NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED=1 npx next build && npx next start -p 3103`).
- Render: six `node render-stream.cjs guest-share-clip.html <W> <H> 60 <dir> <k> 6` + `./encode-stream <dir> <out> 60 2640`.
- Verified: preview contact sheets of both formats at key moments (captions, callouts, stickers clear of words/face,
  Instagram top safe line kept by the shared `HEAD`), and `inspect.swift` on both outputs (see §8 of the README traps:
  PTS = DTS, starts at 0). **Not verified:** CapCut import (Andrew's machine), and the voiceover fit.

### 7. Open questions for Andrew
- Caption wording and pacing; whether to remove the "TRIVIA NIGHT" chalkboard from the AI photo.
- After he slices it in: does he want a full v5 render of the guide with this scene built in?

### 8. Next steps
On his feedback, edit `guest-share-clip.html` (timings are scene seconds in `sceneGuestShare`), preview with a contact
sheet, then re-render under a **new file name** (`… v2 16x9.mp4`). Model: Opus 5.5 medium, as in the plan table, or
Sonnet 5.5 medium for caption-only changes.

---

## Update 2026-11-11 (later): v3 scene with the selfie as the post

**For Andrew:** at your request, there is a second version that keeps the original v3 guest-share scene (same captions,
same 23.6 s timing) and only swaps the plain purple share picture for the AI guest's selfie, on the phone, in the big
picture and in her Instagram Story. Files: `Subscribe and Setup Guide/Guest Share Selfie v3 scene 16x9.mp4` and `… 9x16.mp4`.
It fits 3:28.8–3:52.4 exactly, so nothing after it moves. The 44 s "Guest Share Celebration clip" is kept, unused.

**For the next agent:** source `_Source (to remake clips)/guest-share-v3-selfie.html` = lines 1–644 of
`guest-share-clip.html` (helpers, selfie `igStory`, `bigPic`) + `sceneGuestSelfie` (a copy of `tutorial.html`'s
`sceneGuest` with `p-gshare-cam3.png` as the sheet, Instagram Story tap/ring moved to CSS y 797/778, pink tag-line ring to
y 819) played at `SPEED = 285/240`, `DURATION = 1415/60`. Rendered with six `render-stream.cjs` + `./encode-stream … 60 1415`;
`inspect.swift` on both: 1415 samples, PTS = DTS from 0. Previewed both formats by contact sheet. CapCut import not tested.

---

## Update 2026-11-11 (latest): QR removed from share pictures (app change) + selfie clip v2

**For Andrew:** at your request, **the app no longer prints a QR code on any Share Your Win picture** (all designs and
selfies, Story and Post). The bar's name, handle and address and "Play on Hightop Challenge / hightopchallenge.com/app"
stay. This is a code change in the repo, **not committed or deployed yet**. It goes live on the website (and in the app,
which loads the website) once you say to commit and deploy. The clip is re-made as `Guest Share Selfie v3 scene v2 16x9.mp4`
/ `… 9x16.mp4` (23.6 s, same slot): Jess takes her selfie on screen, turns on Fireworks and Confetti, and posts it. Her
Instagram profile circle now shows her face.

**For the next agent:**
- Code (uncommitted, on `main`): `lib/socialShare/shareDesigns.ts` (`venuePanel`: no QR image, no "Scan to play", text
  column full width, panel height = text height), `lib/socialShare/copyPresets.ts` (`SHARE_SCAN_LINE` removed),
  `lib/socialShare/shareQr.ts` (comment: file kept for `components/native/AppStorePromotion.tsx`),
  `scripts/render-share-cards.cjs` (now fails if a picture HAS a QR), tests `tests/share-card-qr.test.ts`,
  `tests/share-designs.test.ts`, `tests/share-celebration-effects.test.ts`. Docs: Standing rule added to
  `docs/share-win-celebration-plan.md` (Phase 1 rules), `docs/native-app-store-plan.md` Phase 9b line updated.
- Verified: `npm run test` 522 files pass; eslint on touched files and `npx tsc --noEmit` clean;
  `npm run share-card:render -- --sheet` (every picture QR=null, contact sheet looked right). Not done: `npm run build`
  of the repo (the scratch build with the change built fine), commit, deploy. No native rebuild needed (canvas drawing is web code).
- Clip: `guest-share-v3-selfie.html` now uses `p-gselfie-*` (new capture scene `gselfie` in `tutorial-player-capture.cjs`,
  run `PORT=3103 CAMERA_Y4M=<y4m> node tutorial-player-capture.cjs gselfie` against a scratch build containing the change),
  avatar `ai-screens/guest-avatar.png` (crop of `guest-selfie-peace.png`). Both outputs: 1415 samples, PTS = DTS from 0.


## Publication authorization — 2026-11-12

Andrew explicitly authorized committing, pushing and merging all pending changes, including the
Share Your Win QR removal and this handoff, together with the Partner Dashboard Results simplification.
The publication uses branch `release/partner-results-and-share-cleanup`, based on
`f0d625865e967973b8a0ce294dddaaf0f1e8d4e6`. This supersedes the earlier instruction to wait
for commit permission. Production deployment and store/device observations are not independently verified.
No database changes, native rebuild, store submissions or guide-video edits were performed in this release.
The operational backfill log containing 37 player records remains local and is excluded from publication.
