# Fonts

This folder is intentionally empty.

The Hightop Challenge codebase loads its two web fonts directly from Google
Fonts via `@import` at the top of `app/globals.css`:

- **Bree Serif** — game titles, display copy
- **Nunito** — UI body, buttons, weights 400 / 600 / 700 / 800 / 900

Our `../colors_and_type.css` does the same. There are no `.woff2` files to
ship — the Google CDN is the source.

## What's deliberately missing

- **Kalam** (handwritten) loads in the legacy app for the bingo turf /
  leaderboard "scoreboard" look. It is **not** included in the dark
  rebuild. Don't restore it on any player-facing surface.

## If you need self-hosted fonts

Ask the user for the woff2 files (Bree Serif 400, Nunito 400/600/700/800/900),
drop them into this folder, and swap the `@import` in
`../colors_and_type.css` for a series of `@font-face` rules pointing at the
local files.
