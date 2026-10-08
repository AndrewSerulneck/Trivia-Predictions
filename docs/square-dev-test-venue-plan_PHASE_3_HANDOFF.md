# Square dev testing — Phase 3 handoff (closed without a sandbox run)

Date: 2026-10-07. Plan: `docs/square-dev-test-venue-plan.md`. Phase 3 by Claude Sonnet 5.5 / Opus 5.5.

## For Andrew (plain English)

Connecting Square's test (sandbox) system on the dev server never got past a blank white Square page, so you
decided to **test Square changes on the live site** instead. The safety guard (Phase 1) and the hidden
"Hightop Test Bar" venue (Phase 2) stay in place. Everything is committed and pushed to `main`, which deploys
the Phase 1 guard to the live site. Nothing needs you unless you want to try the sandbox again later.

## For the next agent

1. **Scope / status:** plan complete. Sandbox run (plan Phase 3 items 1–3) was abandoned by Andrew's decision,
   not finished. Don't restart it unless Andrew asks.
2. **State:** all plan work committed on `main` and pushed (Phase 1 code `71d77f1` + docs). DB: test venue rows
   from Phase 2 still exist (undo: Phase 2 handoff §4); no `pos_connections` row for `venue-hightop-test`;
   no rewards or wins were seeded. Pacific Street's production connection untouched.
3. **What was verified (2026-10-07):**
   - Dev `Connect` for `venue-hightop-test` → 303 to `connect.squareupsandbox.com/oauth2/authorize` with the
     sandbox app id `sandbox-sq0idb-qykS8kZtCLFL_l3TSAiIBQ`, `session=false`, the five scopes; environment guard
     passes (no row).
   - `.env.local` has `SQUARE_ENVIRONMENT=sandbox`, `SQUARE_SANDBOX_APPLICATION_ID/_SECRET/_ACCESS_TOKEN` (no
     production Square vars locally). App id+secret accepted by Square's token endpoint (only the bogus code was
     rejected); the access token resolves to sandbox merchant "Default Test Account".
   - In Andrew's Chrome, Square's page data was `{"step":"ERROR", "error":"To start the OAuth flow for a sandbox
     account, first launch the seller test account from the Developer Console."}` — the browser has no sandbox
     seller session. Andrew couldn't find "Default Test Account" in the console (he saw only the "Hightop
     Challenge" app). Untried: `https://developer.squareup.com/console/en/sandbox-test-accounts` → Open in
     Square Dashboard; possibly a different developer login owns the app.
4. **Docs:** `docs/square-go-live-runbook.md` §6 (steps, marked not working) and the POS line in `CLAUDE.md`.
5. **Traps:** testing on live means real Square and real money — prefer the hidden test venue on live over
   Pacific Street when possible, and never log a GAN.
