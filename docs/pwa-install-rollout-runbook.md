# PWA Install-Prompt Rollout Runbook

**Purpose:** exact, ordered steps to turn on the "Add to Home Screen" install prompt
(`NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED`) built in Phase 5 of
`docs/bingo-fullscreen-pwa-plan.md`, without repeating the domain-split mistake this flag
exists to prevent. Mirrors the structure of `docs/phase-6-domain-split-runbook.md`.

**Status when this was written:** the install-prompt *UX* is shipped and inert behind a
single flag (`NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED`, unset/off). No env var has been set
anywhere by this work. The manifest and the iOS meta tag are **not** behind the flag — see
§0, "the flag gates promotion, not installability."

---

## 0. Mental model (read first)

- **There is ONE switch:** `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED`. Unset/off (default) =
  no `beforeinstallprompt` listener, no iOS coach card, no install copy anywhere. On = the
  Android install button and the iOS Safari "Add to Home Screen" coach card can render in
  Bingo landscape (`components/bingo/SportsBingoHome.tsx`).
- **The flag gates PROMOTION, not installability.** This is the single most important thing
  to understand before reading anything below. Per `docs/bingo-fullscreen-pwa-plan.md` §2 the
  manifest ships unconditionally: `app/manifest.ts` serves `/manifest.webmanifest`, and
  `app/layout.tsx` emits `<meta name="apple-mobile-web-app-capable">`, on every deploy
  regardless of this flag. **The app is therefore installable, from the apex, right now.** Any
  player who taps Share → Add to Home Screen (or accepts Chrome's own unsolicited install
  banner) gets a real install with `start_url`/`scope` of the apex baked in permanently. The
  flag off means *nothing in the product asks them to*; it does not mean nobody can.
- **The standing exposure is accepted, not fixed.** Un-prompted installs before the domain
  split are the §1 irreversibility risk, at whatever rate players discover Add to Home Screen
  on their own. The mitigation is that nothing advertises it and the window is short — ship
  the domain split, then flip this flag. If that window stretches out, the real fix is to
  stop serving the manifest/apple meta on the apex, not to leave the flag off longer.
- **Resolver:** `isInstallPromptEnabled()` in `lib/pwa.ts`. Single indirection point — no
  component reads `process.env.NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED` directly.
- **Reversal is instant for prompted installs only:** set the flag back to unset/false and
  redeploy and no surface asks anyone to install again. Self-directed Add to Home Screen still
  works, because the manifest is still served. **Reversal also does not uninstall the app from
  players who already installed it** — see §4.

---

## 1. Hard prerequisite: the domain split must be live FIRST

This is the entire reason this flag exists. A manifest's `scope`/`start_url` is baked into
every install at install time. Today the app is served from the apex. If a player installs
now and the domain split (`docs/phase-6-domain-split-runbook.md`,
`NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`) ships later, every installed app navigates out of its own
scope the moment `play.hightopchallenge.com` becomes the real player origin — the browser
chrome comes back, permanently, on that player's home screen, unfixable short of asking them
to delete and reinstall.

**Do not flip `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED` on until the domain-split runbook has
been executed and verified end-to-end on `play.hightopchallenge.com`.**

## 2. Known cutover gap: WebAuthn allowed origins

Already tracked in `docs/bingo-fullscreen-pwa-plan.md` §3 and
`docs/phase-6-domain-split-runbook.md` §2 step 3, restated here because it bites installed
players specifically: **`WEBAUTHN_ALLOWED_ORIGINS` must include the `play.` origin before any
player installs the app.** An installed PWA gets its own storage jar (no carried-over
cookies), so the first launch is a fresh login — passkeys are what make that painless. If
`play.` isn't in the allow-list yet, passkey login/registration throws "Origin is not
allowed" inside the app, with no address bar to fall back to another origin from. Confirm this
env var is set (Production) before proceeding.

## 3. Turning it on

1. Confirm §1 and §2 are done.
2. Set `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED=true` in Vercel (Production, or Preview first
   for a dry run). Do not set it in `.env.local`.
3. Redeploy.
4. **One-venue pilot, not a broad rollout:**
   - Andrew installs manually first (Android: use the in-app "Install" button that now
     appears in Bingo landscape; iOS: Share → Add to Home Screen, following the new coach
     card's copy) and confirms: cold launch → welcome/auth → venue join → Bingo landscape →
     genuinely chromeless fullscreen on iPhone.
   - Then enable for a single pilot venue's real players before broadening. There is no
     per-venue code gate for this — "who gets prompted" is staged by *when* the flag flips
     and by word of mouth/QR placement at that one venue, not by a config toggle.
5. **What to watch during the pilot:**
   - **Re-login friction.** First launch in the installed app is a fresh storage jar. Passkey
     users should sail through (§2); username/PIN users must re-enter credentials once. Watch
     for support questions about "it forgot me."
   - **Location re-prompt.** Geolocation permission does not carry over into the installed
     app's jar either — every installed player sees one fresh location prompt on first
     venue-join. Confirm the existing retry/denial cards (from Phase 4) read sensibly the
     first time a player sees them post-install, not just in the browser.
   - **Stripe/owner surfaces:** not applicable — partners and admins never see this prompt
     (`/owner/*`, `/admin` are excluded by construction; the coach card and install button
     only render inside the player-only `SportsBingoHome` component).
   - **iOS Safari detection false negatives.** `isIOSSafari()` (`lib/pwa.ts`) excludes other
     iOS browsers by UA token (Chrome, Firefox, Edge, in-app webviews). If a player reports
     the coach card missing on a phone that looks like iPhone Safari, check `navigator.userAgent`
     for a token this list doesn't yet cover.

## 4. Reversal

Set `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED` back to unset/`false` and redeploy. Every
*prompt* stops instantly — no code revert, no data migration.

**Two honest caveats, both about what reversal does NOT do:**

1. **It does not stop new installs.** The manifest and the apple meta tag ship unflagged
   (§0), so Share → Add to Home Screen keeps working after the reversal exactly as it did
   before the flag was ever flipped on. Reversal removes the invitation, not the capability.
   Stopping installs outright means not serving `/manifest.webmanifest` and
   `<meta name="apple-mobile-web-app-capable">` — a code change, not a flag flip.
2. **It does not uninstall the app** from any player who already installed it. Their installed
   app keeps working exactly as it did the moment they installed it (same manifest
   `scope`/`start_url`, baked in at install time — see §1). It is not a kill switch for
   existing installs.
