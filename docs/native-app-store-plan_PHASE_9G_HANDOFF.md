# Native app plan — Phase 9g handoff (`/app` asks "Get the app?") — 2026-10-23

## For Andrew (plain English)
- **What changed:** 9f.1–9f.6 are live (commit `6047f68`, Vercel production Ready) and the new build is installed on your iPhone (bundle `com.hightopchallenge.spike`). 9g: once a store link is filled in, someone who opens `hightopchallenge.com/app` on a phone sees a small page — "Get the app" or "No thanks, play in the browser" — instead of being thrown into the store. A Mac-looking Safari (which may be an iPad) gets the same page; a real Mac goes to the website.
- **Live?** 9g is committed and deployed with this note, but **invisible today**: both store links are still empty, so everyone still lands on the player sign-in exactly as before.
- **Needs you:** section J of `docs/native-app-device-checklist.md` (item 33 = the caption-paste check on the iPhone). 9g's page can only be seen once a store URL exists.

## For the next agent
1. **Next:** Andrew's phone pass (section J); then Phases 6/7 fill `IOS_APP_STORE_URL` / `ANDROID_PLAY_STORE_URL` in `lib/appDownloadLink.ts` (that alone turns 9g on). Out of scope: review finding 17 (relative imports in `lib/socialShare/`).
2. **State:** branch `main`; 9f.1–9f.6 at `6047f68`, pushed + deployed. 9g committed after it. No migration, no data touched. Other people's uncommitted files stay unstaged (`CLAUDE.md`'s POS hunk, `docs/pos-rewards-integration-plan.md`, `lib/pos/providers.ts`, `.codex/` etc. — stage share hunks only).
3. **Decisions:** the plan's 9g spec as written (no cookie / "remember my choice"; path `/app` permanent; iPad fix R14 folded in).
4. **Files:** `lib/appDownloadLink.ts` (new `kind: "ask"` with `device: ios|android|ipad-maybe`; `looksLikeMacSafari`), `lib/appDownloadPage.ts` (new, `buildAppAskPage` → one HTML string; only script is the iPad `maxTouchPoints>1` check), `app/app/route.ts` (returns the page, `private, no-store`), `tests/app-download-link.test.ts` (13 cases), plan status line, `CLAUDE.md` app-link bullet.
5. **Traps:** the page uses a `<style>` block (a standalone HTML string, not a React component, so the no-inline-style rule doesn't apply); logo is `/brand/web/htc-logo-96.webp` (proxy allows `/brand/`). iOS build: the phone must be UNLOCKED for `xcodebuild -destination id=…`; a `generic/platform=iOS` build works locked, then `xcrun devicectl device install app`. Build output: `~/Library/Caches/hightop-native/ios-dd`.
6. **Verified:** tsc, lint, full vitest, build (see commit); UA table + page markup unit-tested. **Not verified:** the page rendered on a real phone/iPad (needs a store URL set, or a temporary local edit).
7. **Open questions:** none.
8. **First steps:** after Andrew's pass, fix whatever section J finds; on launch day set the store URLs and view `/app` on both phones.
