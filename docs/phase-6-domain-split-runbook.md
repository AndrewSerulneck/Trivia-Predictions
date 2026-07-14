# Phase 6 Domain-Split Cutover Runbook

**Purpose:** exact, ordered steps to flip `hightopchallenge.com` → marketing (`/info`) and `play.hightopchallenge.com` → the game **without the site missing a beat**. This is the execution detail behind `SYSTEM_CONTEXT.md` §0 and `docs/partner-dashboard-plan.md` Phase 6.

**Status when this was written:** the domain-split code is shipped and inert behind a single flag (`NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`, off). Executing this runbook is a **config/DNS operation — no code changes are required** to go live.

---

## 0. Mental model (read first)

- **There is ONE switch for the cutover:** `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`. Off (default) = today's single-origin behavior. On = host-based routing (apex→marketing, `play.`→game, cross-host redirects).
- **The routing lives in `proxy.ts`** — the **live Next.js 16 edge gate**. Next 16 renamed the old `middleware.ts` convention to `proxy.ts`; it is auto-detected and already runs in production (the build lists it as `Proxy (Middleware)`). **Do NOT add a `middleware.ts`** — having both is a hard build error.
- **The split layers in FRONT of the existing (live) cookie auth-gate** in `proxy.ts`. When `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` is off, `decideDomainSplit` returns `{action:"none"}` and the request falls through to the auth-gate exactly as it does today — the split addition is fully inert and changes nothing. Verified by `tests/proxy.behavior.test.ts` + `tests/lib.domainSplit.test.ts`.
- **The cookie auth-gate is NOT part of this cutover.** It is live and stays exactly as-is (see §5). Do not touch it.

**Reversal is always instant:** set `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED` back to `false` and redeploy. No data migration, no code revert.

---

## 1. Routing contract (what the split enforces once ON)

Defined in `lib/domainSplit.ts` (`classifyPage`, `decideDomainSplit`). When `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED=true` **and** the request host is a known apex/play host:

- **Apex `/`** → internal rewrite to `/info` (URL stays `/`; marketing renders).
- **Apex + any game page** (`/join`, `/venue/*`, `/trivia`, `/bingo`, `/fantasy`, `/pickem`, `/predictions`, `/category-blitz`, `/redeem-prizes`, `/leaderboard`, `/activity`, `/active-games`, `/pending-challenges`) → **308 redirect** to the same path on `play.`.
- **Apex + marketing** (`/info`, `/faqs`, `/advertise`, `/owner/*`) → served on apex (no redirect). **Partner Login stays on apex.**
- **`play.` + marketing page** → 308 redirect back to apex.
- **`play.` + everything else** (including `/`) → served as the game (then the normal auth-gate applies).
- **Never redirected on either host:** `/api/*`, `/_next/*`, `/admin/*`, `/brand/*`, static files. APIs, assets, and admin are host-agnostic.
- **Unknown hosts** (localhost, `*.vercel.app`) → no host routing at all, so local dev and Vercel preview URLs keep working single-origin.

Absolute-URL helpers (`gameUrl`, `gameHref`, `marketingHref` in `lib/domainSplit.ts`) already resolve to the right host based on the flag: relative while off, cross-host when on. The `/info` game CTAs and the venue **display URL** (`app/owner/display/page.tsx`) use them. If you add new cross-host links, use these helpers — do not hardcode a host.

---

## 2. Pre-flight (do once, before flipping anything)

1. **DNS:** point `play.hightopchallenge.com` at Vercel and add it as a domain on the Vercel project. Keep the apex + `www` as-is.
2. **Set env vars** (Vercel project settings; also mirror in `.env.local` for local testing — never commit secrets). Values are documented in `.env.example`:
   - `NEXT_PUBLIC_APEX_HOST=hightopchallenge.com`
   - `NEXT_PUBLIC_PLAY_HOST=play.hightopchallenge.com`
   - `NEXT_PUBLIC_SITE_URL=https://hightopchallenge.com`
   - `NEXT_PUBLIC_PLAY_URL=https://play.hightopchallenge.com`
   - `NEXT_PUBLIC_COOKIE_DOMAIN=.hightopchallenge.com` ← **critical for a seamless player session across hosts** (see §3).
   - Leave `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED=false` **for now.**
3. **Deploy** with the split still OFF. Confirm the live site behaves exactly as before (it will — the flag is off). This proves the env/DNS changes alone are inert.

---

## 3. Cookie continuity (why the site won't drop sessions)

The player session (`tp_sess`, set by `lib/serverSession.ts`) and identity cookies (`tp_user_id`, `tp_venue_id`, set by `lib/storage.ts`) honor `NEXT_PUBLIC_COOKIE_DOMAIN`. Setting it to `.hightopchallenge.com` scopes them to the parent domain, so a session established on either host is valid on the other — a player redirected apex→`play.` stays logged in. **This also keeps the live cookie auth-gate in `proxy.ts` satisfied across hosts** (`tp_venue_id`/`tp_user_id` remain visible on `play.`).

- **Owner/admin sessions stay host-scoped on purpose** (`lib/ownerSession.ts`, admin session) — the Partner Dashboard lives on the apex, so those cookies do not and should not span subdomains. Do not add a domain to them.
- Existing host-only cookies from before the cutover keep working; they're simply reissued with the parent-domain scope on the user's next save/login. No forced logout.

---

## 4. Cutover (flip the split ON)

Do this on a **preview deployment first** if you want a dry run with real hosts; otherwise straight to production is safe because reversal is one flag.

1. Set `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED=true` and redeploy.
2. **Smoke test both hosts:**
   - Apex `/` → shows marketing (`/info` content).
   - Apex `/venue/<id>` or `/join` → 308-redirects to `play.` same path.
   - `play.` `/` → shows the game login (`JoinFlow`).
   - `play.` `/info` → redirects to apex.
   - **Partner Login** from apex `/info` → reaches `/owner/login` → dashboard (all on apex, no bounce).
   - Log in as a player on `play.`, complete entry to a venue → session holds (auth-gate passes with the shared-domain cookies); navigating a stray apex game link redirects to `play.` still logged in.
   - Venue **display URL** in the Partner Dashboard shows a `play.` URL and the QR/preview loads.
   - Stripe billing + webhooks unaffected (`/api/*` is never redirected).
3. **If anything is off:** set `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED=false`, redeploy — you're instantly back to single-origin. Diagnose, then retry.

---

## 5. The cookie auth-gate in `proxy.ts` — live; leave as-is

`proxy.ts` has always contained (and, on Next 16, actively runs) a cookie auth-gate: non-public paths without `tp_venue_id`/`tp_user_id` cookies and without a fresh entry handoff are redirected to `/`. This is existing production behavior and CLAUDE.md documents it correctly. **The domain split does not change it** — it only adds host routing in front.

Identity is enforced in depth: this edge gate (cookie presence) **plus** the client `AuthNavigationGuard` (stronger `tokenVerified` signal, mounted in `app/layout.tsx`) **plus** API-layer auth (`readSession`, `requireOwnerAuth`, `requireAdminAuth`, venue-presence) and client Supabase **RLS**. For the cutover, do nothing here beyond ensuring `NEXT_PUBLIC_COOKIE_DOMAIN` is set (§3) so cookies stay valid across hosts. Any change to the auth-gate itself is a separate, deliberately-verified project — not part of this runbook.

---

## 6. Post-cutover polish (Phase 7)

Phase 7 SEO scaffolding is **done**: `app/sitemap.ts` serves the marketing sitemap (`/info`, `/faqs`, `/advertise`), and `/info`, `/faqs`, `/advertise` carry full canonical/OG/Twitter metadata (`/info` also has Organization + WebApplication JSON-LD). **Robots policy is the pre-existing `public/robots.txt`** (a deliberate, committed, site-wide `Allow: /` that explicitly allow-lists AI crawlers — GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended — do not narrow this without a deliberate product decision); it now also points at the sitemap via a `Sitemap:` line. A dynamic `app/robots.ts` was tried and reverted — Next.js silently prefers the static `public/` file at request time (dev mode hard-errors on the conflict; production silently serves only the static one), so a dynamic robots route here is dead code. After the cutover, re-confirm the apex canonical points at the apex (not `play.`) and that header/footer CTAs route correctly (Player Game → `play.`, Partner Login → apex dashboard).
