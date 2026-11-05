# Share to social — what Andrew does before Phase 5

Plan: `docs/partner-social-promo-plan.md`. Phase 5 (Instagram "Post now") can start once Steps 1–6 below are done.
Everything here is on Meta's website. Meta renames menus often; if a name below doesn't match, pick the closest one and
tell Claude. Step 1 can take days, so start it first; Steps 2–6 can run while you wait.

**Rules that stay in force:** nothing is merged to `main` (App Store review). The privacy text and the two Meta
callbacks are already written on the `after-app-review` branch and will be deployed together with Phase 5, not before.
The app secret is never pasted in chat, a screenshot or git.

## Step 1 — Verify the business (starts the clock)
1. Open Meta Business Suite (business.facebook.com) and create or open the business account for **Hightop Challenge LLC**.
2. Settings → Security Center → **Start verification**. Enter the legal name, address and phone exactly as on the
   LLC's paperwork, and upload one document (certificate of formation, EIN letter, or a utility bill in the LLC's name).
3. Wait for approval (usually a few days). You can do Steps 2–6 meanwhile.

## Step 2 — Make the demo accounts Meta's reviewer will use
1. A **Facebook Page** for Hightop Challenge (or use an existing one you admin).
2. An **Instagram Business account** for Hightop Challenge (Instagram app → Settings → Account type → Switch to
   professional → Business). It must not be a personal account.
3. Keep their logins handy. Linking the Instagram account to the Page is optional for Instagram Login but helps Meta.

## Step 3 — Create the new Meta app
1. Go to developers.facebook.com → **My Apps → Create App**. Choose the option for business/"Other" that offers
   Instagram and Facebook Login.
2. Name: **Hightop Challenge for Venues**. Contact email: `support@hightopchallenge.com`. Attach the business from Step 1.
3. This must be a **new app**. Do not reuse the player app (its ID is in `capacitor.config.json`).

## Step 4 — Fill in the app's basic settings
App settings → **Basic**:
1. **Privacy policy URL:** `https://hightopchallenge.com/privacy`
2. **Terms of Service URL:** `https://hightopchallenge.com/terms`
3. **App icon (1024×1024):** upload the square Hightop logo (tell Claude which file if you want help choosing).
4. **Category:** Business and Pages.
5. **User data deletion:** choose "Data deletion request URL" and enter
   `https://hightopchallenge.com/api/social/meta/data-deletion`
   (If Meta refuses to save because the address doesn't answer yet, leave it blank for now; it is entered when we deploy
   with Phase 5.)
6. Save.

## Step 5 — Add the two products

> **Update 2026-11-04:** Meta now calls these *use cases* (Use cases → Customize). On the Page use case, Add only
> `pages_manage_posts` and `pages_read_engagement` (Add = testing only, not App Review). On the Instagram use case,
> "API setup with Instagram login" no longer exists for new apps; it is "API setup with **Unified login**". Do not
> create its configuration yet (its default preset is wrong for us); Phase 5 creates it with the redirect URL. The
> deauthorize callback is entered then too.
1. Add product **Instagram API with Instagram Login** (open its setup page and leave it; Phase 5 supplies the redirect
   address, which Claude will give you).
2. Add product **Facebook Login for Business**. In its settings, **Deauthorize callback URL:**
   `https://hightopchallenge.com/api/social/meta/deauthorize` (same note as above if Meta won't save it yet).
3. Don't request permissions yet; that is the later App Review submission.

## Step 6 — Hand the keys to Claude

> **Status 2026-11-04:** App ID `870343082807996` recorded as `META_PARTNER_APP_ID` in `lib/social/metaConfig.ts`
> (test: never the player app's ID). **Done:** `META_PARTNER_APP_SECRET` in `.env.local` verified against Meta for
> `870343082807996` (19:21 UTC; earlier it held the player app's secret). Andrew replaced the Vercel value too (not
> readable by Claude; the entry is still on Production + Preview — Production should be unticked until the App Store
> review is over). App roles: administrators only. The Instagram use case (API setup with Unified login) shows **no
> separate Instagram app ID/secret** (Andrew checked 2026-11-04): Phase 5 uses `META_PARTNER_APP_ID` + this secret
> for Instagram too. Re-check any time (prints only OK / an error, never the secret):
> `node --env-file=.env.local -e 'fetch("https://graph.facebook.com/v21.0/oauth/access_token?grant_type=client_credentials&client_id=870343082807996&client_secret="+encodeURIComponent((process.env.META_PARTNER_APP_SECRET||"").trim())).then(r=>r.json()).then(j=>console.log(j.error?j.error.message:"OK"))'`
1. App settings → Basic: copy the **App ID** (not secret; fine to paste in chat). Also copy the Instagram app ID/secret
   from the Instagram product's setup page if it shows separate ones, and tell Claude it does.
2. Click **Show** next to **App secret** and copy it. Do not paste it in chat. In a terminal in the project folder:
   `echo 'META_PARTNER_APP_SECRET=PASTE_SECRET_HERE' >> .env.local` (note `>>`), then
   `vercel env add META_PARTNER_APP_SECRET` (choose Preview for now; Production waits until the App Store review is
   over and you approve).
3. Add yourself under **App roles → Roles** (and anyone who will test). While the app is unapproved, only people with a
   role can connect an account.

## Done? Tell Claude:
"Meta setup done, App ID is …". Then Claude starts Phase 5. Whether Step 1 (verification) has finished does **not**
block Phase 5 coding; it blocks the later App Review submission.

## Phase 5 setup — so "Post now" to Instagram can be tried (added 2026-11-04)

The code is built (plan Phase 5). Four things are Andrew's; Claude can do 3–4 once you say go.

1. **Create the login configuration** (developers.facebook.com → the "Hightop Challenge for Venues" app → Facebook
   Login for Business → **Configurations** → Create configuration). Meta's default preset is a system-user token
   with ads/messaging permissions: **do not use it.**
   - Name: `Partner posting`. Login variation: **General**.
   - Access token: **User access token**. Expiration: leave Meta's default.
   - Assets: **Pages** and **Instagram accounts**.
   - Permissions: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`,
     `pages_manage_posts`. Nothing else.
   - Save, copy the **Configuration ID** (a number; not a secret) and give it to Claude. It goes in
     `META_PARTNER_LOGIN_CONFIG_ID` in `lib/social/metaConfig.ts`. Until then "Connect Instagram" says "not set up yet".
2. **Valid OAuth Redirect URIs** (Facebook Login for Business → Settings), each exactly:
   - `https://hightopchallenge.com/api/owner/social/meta/callback`
   - the `after-app-review` Preview's address + `/api/owner/social/meta/callback` (Vercel → the project → Deployments →
     the newest `after-app-review` preview → its branch domain, the one with `-git-after-app-review-`)
   - `http://localhost:3000/api/owner/social/meta/callback` (Meta allows localhost only while the app is in
     development mode)
   While you're there, set **Deauthorize callback URL** `https://hightopchallenge.com/api/social/meta/deauthorize`
   (Step 5 above) if it isn't set.
3. **Apply the migration** `supabase/migrations/20261104193338_social_publishing.sql` (two server-only tables and the
   private `social-media` storage bucket). Shared production database, so it waits until you say the App Store review
   is over or explicitly OK this one `supabase db push`.
4. **Turn the feature on for the Preview only:** `vercel env add NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED preview` with value
   `true`, then redeploy the Preview. `SOCIAL_TOKEN_KEY` is already in `.env.local` and Vercel Preview (added by Claude
   2026-11-04, never shown). Production gets both after the App Store review.

**Then try it** with Hightop's own Instagram Business account (it must be linked to the Hightop Facebook Page, and you
must have a role on the app): Partner Dashboard → Share to social → Post to Instagram → Connect Instagram → post a
Post, a Story and a Reel. Check each on Instagram (the Reel's cover should be the end card) and tell Claude what you saw.

## Phase 6 setup (Facebook Page "Post now") — nothing new to create

Phase 6 (2026-11-04) uses the **same** login configuration, redirect URIs, migration, key and flag as Phase 5: the
configuration above already asks for `pages_manage_posts`, and one login now connects the Instagram account **and**
the Facebook Page. Before trying it:
- In the configuration's **Assets**, keep **Pages** ticked (it is, if you followed step 1).
- In the app's **Settings → Advanced**, check whether **Require App Secret** is on. If it is and the Reel upload fails,
  tell Claude: Meta doesn't document whether the Reel upload host (`rupload.facebook.com`) accepts the app-secret
  proof that every other call sends.
- **Try it** (once the Post now box is switched back on, plan D35): post a Post and a Reel to the Hightop Facebook
  Page. Facebook Stories aren't offered.

## Later (not now)
- **App Review submission:** after Phases 5–7 work, Claude gives you screencast scripts, permission wording, and a
  reviewer test login, and you record and submit. Permissions to request then (Unified login, D28): `instagram_basic`,
  `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, nothing more.
- **Deploying:** Phase 5's policy text and callbacks go to a Preview deploy of `after-app-review`, never `main`, until
  you say the App Store review is over.
