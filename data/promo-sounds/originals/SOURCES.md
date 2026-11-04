# Sources and licences

| File | Source (inferred from Pixabay's file naming; Andrew to confirm) | Licence | Added | Used as |
|---|---|---|---|---|
| `driken5482-applause-cheer-236786.mp3` | https://pixabay.com/sound-effects/applause-cheer-236786/ (by driken5482) | Pixabay Content License | 2026-11-03 | Prize reveal: applause + cheer. Burst from 1.0 s to ~5.5 s, natural fade to 7.5 s |
| `vishiv-crowd-cheering-in-stadium-435357.mp3` | https://pixabay.com/sound-effects/crowd-cheering-in-stadium-435357/ (by vishiv) | Pixabay Content License | 2026-11-03 | Prize reveal: stadium crowd bed. Loudest at 9.0–10.5 s; read from 8.0 s for 4.4 s |

`contentIdChecked` (plan §6, step 2): not yet. These are sound effects (a low claim risk), but run the 48-hour test
Reel on Hightop's account before Phase 2 ships them.

## Converted for the website (Phase 2, 2026-11-03)

Made with `python3 scripts/convert-promo-sound.py <original> <start> <length> <id>` (macOS `afconvert`, AAC 160 kbps,
48 kHz stereo). Trimmed here rather than at mix time, so each served file is short (Pixabay's "not standalone"
condition, plan §6). Registered in `lib/promo/promoSounds.ts`.

| Served file | From | Start | Length | Size |
|---|---|---|---|---|
| `public/promo/sounds/applause-cheer-v1.m4a` | `driken5482-applause-cheer-236786.mp3` | 0.95 s | 6.1 s | 129 KB |
| `public/promo/sounds/stadium-crowd-v1.m4a` | `vishiv-crowd-cheering-in-stadium-435357.mp3` | 8.0 s | 4.5 s | 92 KB |
