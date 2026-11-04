# Share to social: original sound files

Drop the original sound files here (MP3, WAV or M4A; any length). They are **not** served to the website. Claude
trims them, converts them to small AAC files in `public/promo/sounds/<id>-v1.m4a`, and records each one's licence in
`lib/promo/promoSounds.ts` (`docs/partner-social-promo-plan.md` §4.2, §6).

For each file, Claude needs:

- **Where it came from:** the page you downloaded it from (URL).
- **The licence:** CC0, Pixabay Content License or Mixkit Free License only. No CC-BY, "personal use" or
  "non-commercial" files (plan §6).

<audio controls src="vishiv-crowd-cheering-in-stadium-435357.mp3" title="Title"></audio>
pixabay

<audio controls src="driken5482-applause-cheer-236786.mp3" title="Title"></audio>
pixabay 

Easiest way: name each file after what it is (`crowd-cheer-big.mp3`, `applause.wav`) and paste its source URL in your
message to Claude, or add a line to `SOURCES.md` in this folder.
