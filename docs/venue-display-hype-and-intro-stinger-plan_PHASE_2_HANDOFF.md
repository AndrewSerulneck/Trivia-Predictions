# Venue Display Hype — Phase 2 Handoff (stinger sound)

Written 2026-11-12 by Claude Sonnet 5.5 (the plan's named model for Phase 2).

**For Andrew:** the intro now plays your explosion when the logo bursts in, and your shine sound when "IT'S GAME
TIME." starts to appear. TV browsers usually block sound that starts on its own, so most TVs stay silent and nothing
breaks; the dashboard **Expand** button should play it. Not verified by ear or in a browser.

**For the next agent**
- Sounds (Andrew's own files, from `~/Downloads`; he chose them, so the plan's CC0 hunt is moot):
  - `public/brand/web/htc-stinger-boom-v1.m4a` (25 KB): the **first** explosion of `Explosion Sound Effects.mp3`
    (28.9 s of back-to-back explosions; first one starts ~1.2 s, silent 3.5–4.7 s). Cut so the impact lands at 0.30 s (`T_HIT`), 3.4 s long, 0.8 s fade-out. Played on the first animation frame.
  - `public/brand/web/htc-stinger-shine-v1.m4a` (18 KB): from `Shine - Free Sound Effect.mp3`, starting at its first
    audible sample, 1.9 s with fade, scaled to 65% so it supports the boom. Played when animation time reaches `T_TAG` (2.15 s).
  - Both mono AAC 64 kbps via `afconvert`, peak-normalised to about -1 dBFS. Loudness not measured (no ffmpeg).
- Code: `components/venue-screen/TvIntroStinger.tsx` (`STINGER_SOUND_SRC`, `STINGER_SHINE_SRC`, `makeAudio`,
  `playStingerSound`; rejection swallowed; both paused on unmount); `app/owner/display/page.tsx` (Expand iframe
  `allow="autoplay; fullscreen"`); tests in `tests/venue-screen-intro-stinger-contract.test.ts` (16 total).
- Trap: Andrew's files are third-party downloads; the licence is unconfirmed (Plan §5 risk "Sound licensing"). He
  chose them; confirm he can use them on a website.
- Verified: contract tests, `tsc --noEmit`. **Not verified:** playback and sync by ear/browser, autoplay-blocked
  silent path in headless Chromium, iOS Safari. Phase 6 covers real TVs.
- Next: Phase 0 (Opus 5.5, high) engine; add sound items to `docs/tv-display-physical-device-checklist.md` in Phase 6.
