# Square go-live runbook (POS Phase 2g)

Plan: `docs/pos-rewards-integration-plan.md` §2g. Written 2026-10-06. Nothing here has been run yet:
production currently has **no** `POS_*` / `SQUARE_*` variables and the flag is off.

## 0. Before anything: gates
1. `/code-review high` + `/security-review` on everything Square since `27f5eea` (Andrew is running one review after 2g). **Findings fixed before step 4.**
2. Privacy policy: **the app has no privacy-policy page** (searched `app/`, `components/`, `lib/`, `public/`). Andrew decides whether one is needed before partners connect a POS. If one is written it should say: a partner may connect their Square account; we store its access token **encrypted**, use it only to issue gift cards / look up discounts for rewards, and a partner can disconnect any time.
3. Ask Square (support/docs): issuing eGift cards through the API costs the seller nothing extra; production OAuth needs no review unless listed on the Square App Marketplace (we are not listing).

## 1. Andrew — Square Developer Console (the app → **Production**)
- Copy the production **Application ID** and **Application secret** (OAuth page).
- OAuth **Redirect URL**: `https://hightopchallenge.com/api/owner/pos/square/callback`
- **Webhooks → Add subscription**, URL `https://hightopchallenge.com/api/webhooks/square`, events `gift_card.activity.created` and `oauth.authorization.revoked`. Copy its **Signature key**.
  - Production API version should be left at default; the code pins its own `Square-Version` on calls.

## 2. Vercel production env (Andrew pastes values; never `vercel env pull`)
**2026-10-06:** `SQUARE_ENVIRONMENT=production` and `SQUARE_WEBHOOK_NOTIFICATION_URL` are already added (agent, non-secret).
§0.1 (the review) is done: `docs/square-review-fixes-plan.md`, R1–R4 deployed in `12bfa6b`. The flag-on redeploy is the push of R5.
```
vercel env add POS_TOKEN_KEY production                  # fresh 32-byte key (below)
vercel env add SQUARE_ENVIRONMENT production             # production
vercel env add SQUARE_APPLICATION_ID production
vercel env add SQUARE_APPLICATION_SECRET production
vercel env add SQUARE_WEBHOOK_SIGNATURE_KEY production
vercel env add SQUARE_WEBHOOK_NOTIFICATION_URL production  # https://hightopchallenge.com/api/webhooks/square
vercel env add NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED production   # true — LAST
```
- Generate the key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` — check the accepted format in `lib/pos/crypto.ts` first. Store it in a password manager. **Lose it and every venue must reconnect.** Do not reuse the laptop's key.
- **Trap:** `NEXT_PUBLIC_APP_URL` is *not* set in production (only `NEXT_PUBLIC_SITE_URL`). Without `SQUARE_WEBHOOK_NOTIFICATION_URL` the webhook answers **503** forever (`squareWebhookConfig` in `lib/pos/squareConfig.ts`). The URL must match the Square subscription **exactly** (Square signs it).
- No pilot gate exists (2c removed it), so there is no `POS_SQUARE_PILOT_VENUE_IDS`. The moment the flag is on, every partner sees "Point of Sale" and can connect Square.
- `NEXT_PUBLIC_*` is inlined at build: set it, then redeploy production (Andrew approves the deploy). Server-only vars also need a redeploy to be picked up.

## 3. Smoke test after deploy
1. `POST https://hightopchallenge.com/api/webhooks/square` with body `{}` and no signature → **401** (503 means the key or notification URL is missing).
2. Signed-in owner opens Partner Dashboard → menu → **Point of Sale** → Square shows **Connect**; `/api/owner/pos` answers 200.
3. Square Developer Console → Webhooks → **Send test event** → 200 and a `[PosSquare] webhook-ignored` or `webhook-activity` log line.
4. Connect Andrew's own Square seller account; confirm the location picker, then Disconnect/reconnect. Then Phase 2h.

## 4. Turning it off
Unset (or set `false`) `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED` and redeploy. The menu row, sheet and `/api/owner/pos*` disappear/404. **By design**, already-issued gift cards keep working and `/api/webhooks/square` keeps recording (it is not flag-gated). Do not delete the webhook subscription or `POS_TOKEN_KEY` while connections exist.

## 5. Logs
Vercel → project → Logs, filter `[PosSquare]` and `[Pos]`. Key lines: `webhook-bad-signature` (wrong key/URL), `webhook-not-configured` (missing env), `token-decrypt-failed` (wrong `POS_TOKEN_KEY`), `environment-mismatch`, `webhook-redeem-on-unclaimed-coupon`, `webhook-backstop-claim-unavailable`, `ledger-*-failed`. Stuck claims: admin stuck-claim list (2c).
