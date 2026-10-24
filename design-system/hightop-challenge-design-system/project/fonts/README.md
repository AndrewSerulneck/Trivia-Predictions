# Fonts

Nunito is the only website text family (Andrew, 2026-10-24).

The app self-hosts its variable font through `next/font/google` in `app/layout.tsx`.
Design previews import only Nunito from `../colors_and_type.css`. Standalone website
pages use `public/fonts/nunito-v1.css` and `nunito-latin-v1.woff2`; redistribution
terms are in `public/fonts/nunito-OFL-v1.txt`. Do not restore Bree Serif, Kalam or
monospace fonts. Use the shared font tokens and `tabular-nums` for changing numbers.
