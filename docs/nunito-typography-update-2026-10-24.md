# Nunito typography and dashboard headings — 2026-10-24

The website now uses Nunito for headings, body text, controls, scores and newly rendered share
pictures. The Partner Dashboard headings are smaller: Active Group Games fits on one line beside
its add button at 320/350/390/1280 px, matching Active Prizes. These changes are locally verified and prepared in an isolated release commit; they are not live.
Publishing is waiting for Andrew’s approval after automatic review rejected the production push. No data, questions,
prize eligibility, game behavior or notification delivery changes.

## Decisions and implementation

Andrew requested slightly smaller Partner Dashboard headings so Active Group Games stays on one
line, plus the same Nunito font throughout the website. This supersedes the older Bree Serif
heading and monospace typography rules. Weights, game identities/colors and content remain.
Existing artwork, already-generated/cached pictures, emails and unlinked historical exports are
outside the website font change; no immutable artwork was overwritten. The bundled native
offline page is outside the website and no native binary was changed.

The heading size is a shared design token, `--ht-text-dashboard-heading`:
`clamp(18px, 5.6vw, 22px)`. Measured sizes are **18 / 19.6 / 21.84 / 22 px** at
**320 / 350 / 390 / 1280 px** respectively, versus the old 30 px section title. The shared card
uses `text-dashboard-heading font-extrabold`. It can still wrap under unusual text zoom or
extremely narrow layouts; no forced nowrap, clipping, ellipsis or smaller add target was added.
Both headings use the same rule. The game/prize filters, three-row list limit and requests stay.

Nunito remains self-hosted by `next/font/google` in `app/layout.tsx`, including the generated
metric-matched fallback. Bree Serif is no longer declared or downloaded. The body token is the
single family; display/mono/story tokens and Tailwind sans/serif/mono utilities are compatibility
aliases. Existing `tabular-nums` keeps changing numbers aligned. Two Bingo inline monospace
family overrides were changed to the body token. Canvas share designs use the same tokens and
sans-serif fallback. The share preview renderer now uses the local Nunito face too.

The app-download HTML and fatal root-error boundary do not always have the normal root font
variable. They use the local **39,152-byte variable Nunito Latin WOFF2**, CSS and OFL license in
`public/fonts/`. The fallback family alias is `Hightop Nunito`, using the exact Nunito bytes from
the previous Next build. It does not override `--font-nunito`, so normal pages retain Next's
metric-matched fallback and do not request a second font. The root-error boundary imports that
CSS through Next; the standalone HTML links it. A custom minimal `app/not-found.tsx` prevents
Next's default system-font 404 from escaping the shared typography.

`/fonts/*` has the same year-long immutable cache policy as versioned brand assets. New bytes
require a new filename. The existing cache contract now checks exactly the two permitted
immutable path families instead of counting one hardcoded header occurrence. No other page is
made immutable. Nunito's redistribution license was retrieved from Google's font repository and
is shipped as `public/fonts/nunito-OFL-v1.txt`.

## Scope and starting state for the next agent

Base: `main`, **`d450d9a702929ef29e77fa9dcfdb2fca94d9c02f`**, before this update. Isolated
review source: `/private/tmp/hightop-nunito-review-2026-10-24` (archive, no `.env*`); isolated
release worktree: `/private/tmp/hightop-nunito-release-2026-10-24`, branch
`release/nunito-unification-2026-10-24`. Both use installed root `node_modules` by symlink.
The reviewed files match byte-for-byte between these checkouts. Publication uses this scoped
worktree; never stage/deploy the dirty root wholesale.

Root has unrelated unpublished partner messaging, native/POS work, moved design assets and
configuration files. These stay out of the release. `CLAUDE.md` is a mixed file: only the new font
rule is included; the existing partner-message documentation stays dirty. Do not restore it from
HEAD wholesale. No database read/write/import/migration, paid generation, message/email/push
send, backup or data undo log was required. Reversal is a scoped code revert; no data rollback.
The previous three-question publication and its ignored backup/undo files remain untouched.

Changed files and roles:

- `app/layout.tsx`: load Nunito only; keep the generated HTML variable/preload.
- `app/globals.css`: body/display/mono/story family aliases and dashboard size token.
- `tailwind.config.ts`: family-utility aliases and dashboard heading utility.
- `components/owner/dashboard/DashboardSectionCard.tsx`: the shared smaller heading.
- `components/bingo/BingoBoardCard.tsx`: remove two direct monospace family overrides.
- `lib/socialShare/shareDesigns.ts`: display fallback matches the body family.
- `scripts/render-share-cards.cjs`: sample renderer uses local Nunito/CSS instead of Bree/Google.
- `lib/appDownloadPage.ts`, `app/global-error.tsx`, `app/not-found.tsx`: standalone/fallback pages.
- `public/fonts/{nunito-v1.css,nunito-latin-v1.woff2,nunito-OFL-v1.txt}`: versioned static face,
  fallback CSS (495 bytes) and license (4,384 bytes); do not overwrite after publication.
- `next.config.ts`: immutable cache only for the new versioned font path family.
- `tests/fonts-contract.test.ts`: one family, aliases, foundation consistency, fallback asset/license
  and protection against literal family overrides.
- `tests/brand-logo-assets-contract.test.ts`: precise immutable path allowlist.
- Both `design-system/{hightop-challenge-design-system/project,project}/colors_and_type.css`,
  both corresponding `README.md` and `fonts/README.md`: canonical/mirrored font and scale rules.
  Their unrelated historical color/layout differences were preserved.
- `CLAUDE.md`, `SYSTEM_CONTEXT.md`: new single-family rule; historical dated release notes stay.
- This document: implementation/validation/release handoff; there is no new multi-phase plan.

## Validation

Installed Node **v24.19.0**, Next **16.1.6**, Playwright **1.61.1**. The isolated candidate passes
**5,507 tests / 13 environment skips**, **445 suites / 1 skipped**, **24.17 s**; typecheck, lint
and a credential-free **217-page production build** pass. After the final standalone-fallback
CSS adjustment, the focused font/cache/download checks pass **27/27**; the final custom 404 is
also covered by the production build and rendered checks. No font test was removed to pass.

The first full run caught the old cache test's assumption that logos were the only immutable
assets; the new versioned font assets require their own allowed path. The test now validates
the configured allowlist. An initial lint warning about a manually linked stylesheet in the
fatal error component was resolved with a CSS import; final lint has no errors/warnings (the
existing large-module Babel styling notice is informational).

Final Chromium review passed **49 views / 1,528 visible text nodes**, with zero font violations, page errors or external requests. Screens include the dashboard, info, partner login, support, admin, venue, Pick ’Em, NFL Pick ’Em, Fantasy, prize wallet, 404 and standalone app-download prompt.

Dashboard list/empty/error/loading states fit at all four widths. Glyph bounds show one line,
no h2 overflow and no add-button overlap. Regular pages retain `Nunito, "Nunito Fallback", ...`;
standalone pages load the exact same Nunito face under the fallback alias. Tailwind legacy family
utilities compute to Nunito. Existing game fixture data comes from
`scripts/theme-screenshots-fixtures.cjs`; all API requests were intercepted and external origins
blocked. No real partner/game/prize/notification operation was exercised.

All **64** sample share pictures (8 fixture payloads × 4 designs × Story/Post) rendered using
the real canvas renderer, and every QR decoded to `https://hightopchallenge.com/app`. Preview
outputs are ignored local artifacts; no cached production image was regenerated or replaced.

Exact commands from the isolated review checkout:

```sh
npm run test
npx next typegen
npx --no-install tsc --noEmit
npm run lint
env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" NEXT_TELEMETRY_DISABLED=1 npm run build
npm run share-card:render -- --sheet
```

Fixture server: `env -i PATH="$PATH" HOME="$HOME" TMPDIR="$TMPDIR" NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3116`.
Local one-off runner in root: `node tmp/nunito-unification-2026-10-24/browser.cjs http://127.0.0.1:3116 final-browser`.
Chromium and localhost binding need the approved sandbox escalation on this Mac. No auto-review
rejection occurred. No production credentials are supplied to the fixture server.

## Cost and remaining limits

Measured cold `/info` font response payload falls from **2 files / 49,512 bytes** (live baseline)
to **1 file / 39,152 bytes** (candidate): **10,360 fewer bytes, 20.9% less**. Headers/TLS/HTML/CSS
are outside these payload measurements; this is not a cloud invoice. At 1,000 cold regular visits
per day that saves about **10.36 MB/day / 310.8 MB per 30 days**; 10× that volume saves 3.108 GB.
Cached visits continue to avoid downloading the font again. No extra DB reads/writes, providers,
AI credits, timers/jobs, polling, retries or fan-out per user/run/day/month.

Standalone download/error pages can now fetch 39,152 font bytes plus the small CSS on their first
visit, cached under versioned immutable URLs; ordinary pages do not load that fallback face.
The app-download ask remains inactive until store URLs are set. At a hypothetical 1,000 first-time
standalone views/day, that font payload would be 39.152 MB/day / 1.175 GB per 30 days; current
standalone traffic and dollar impact are unmeasured. No paid service or new recurring operation
was enabled. Regular-page font measurements are repeated after publication below.

Physical-device Safari/Android, real email clients and native offline UI were not tested. Browser
checks do not prove OS-native pickers or third-party iframe fonts; those are not app-controlled
text declarations. Existing email-layout exceptions/full-bank trivia sync failure are outside
this task and remain unchanged. Implementation and local validation are complete. Publishing requires Andrew’s explicit approval
for this follow-up; the prior approval covered the earlier batch according to automatic review.

## Publication and handoff

**Built, tested and committed locally; not pushed or deployed.** Root `main` remains at
`d450d9a702929ef29e77fa9dcfdb2fca94d9c02f`; live production remains the earlier Group Games/copy
release. The implementation commit is on `release/nunito-unification-2026-10-24` in the isolated
release worktree and contains this note. Obtain its exact SHA with:

```sh
git -C /private/tmp/hightop-nunito-release-2026-10-24 log -1 --format='%H %s'
```

Automatic approval review rejected the combined commit/push shell command **before execution**
because pushing this new follow-up directly to production `main` was not explicitly authorized;
it judged Andrew’s earlier publishing request to cover the previous batch only. The local commit
was then completed separately. No workaround or indirect publication was attempted. The only
open question is approval to push **this typography update** live. Do not retry publication until
Andrew approves it. No secrets or data are involved, but pushing triggers a production deployment.

Recommended next steps after approval (no particular model/effort is required):

1. Confirm the release branch’s clean state and that `origin/main` has not advanced; if it has,
   integrate the reviewed changes without discarding newer work. Use this isolated worktree,
   never the unrelated dirty root.
2. Push the reviewed commit with `git push origin HEAD:main` from that worktree. No force push.
3. Verify push-triggered GitHub CI, the Vercel deployment’s exact source SHA and READY state,
   and both `hightopchallenge.com` / `play.hightopchallenge.com` aliases. Verify real `/info`
   computed fonts/transfer and dashboard heading fit using intercepted fake API responses.
4. Record exact application/deployment IDs, checks and public font-transfer observations here.
   The local baseline saves 10,360 bytes per cold normal visit; compare actual live transfer.
5. Preserve all root dirty files byte-for-byte if aligning root `main` to the published commit.
   A mixed reset only after proving an empty index and recording/verifying working-file hashes
   is the established method; never reset hard. Publish any release-record follow-up separately.

Unverified: production deployment/CI for this update, actual live font savings and physical devices.
The local browser server was stopped after validation; rerun the exact command above if needed.

For future typography work, keep Nunito/its fallback centralized. Do not restore Bree Serif or a
monospace typeface to fix spacing; use weight/size and `tabular-nums`. Keep both design foundation
copies aligned for these font tokens. New static font/CSS bytes require new versioned names.
Preserve unrelated dirty work and existing private evidence. The requested work has no next
implementation phase once the scoped release is verified; operational device checks are optional.

Ignored local evidence: `tmp/nunito-unification-2026-10-24/` contains `entry-status.txt`,
`entry.diff`, `before.json`, `scope.json`, `reviewed-manifest.json`, test/typecheck/lint/build logs,
font-transfer JSON, browser reports/PNGs and share-render log. Sample share PNGs are under
`/private/tmp/hightop-nunito-review-2026-10-24/tmp/share-cards/`. No secrets, players or consequence
records belong in commits.
