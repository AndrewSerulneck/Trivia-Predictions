# Fire TV app plan — Phase CR2.3 handoff (2026-11-25)

**For Andrew:** four small fixes from the CR2 review. The TV connect screen's test now catches the old keyboard bug;
one OK press on an expired code does one thing; the privacy page and store notes no longer contradict themselves; and
admin Venues says "Codes didn't load." with Retry. Committed, **not pushed or live**: it ships with CR3 as one PR
(your new batching rule). Nothing needs you.

**For the next agent (CR3).** Branch `fix/cr2-connect-privacy` (from `main` at `f3a6750c`), one local commit with
this phase plus the CLAUDE.md / AGENTS.md rule "Batch pushes, PRs and deploys". Do CR3 on this branch, commit, then
push once, open one PR, `gh pr checks <n> --watch` once, merge.

- **F64** `tests/tv-app-contract.test.ts`: asserts no `autoFocus`; token checks instead of exact lines. Mutation
  proof: adding `autoFocus` to the input fails it.
- **F66** `components/venue-screen/TvConnectScreen.tsx` `onBoxesKeyDown`: Enter/Space calls `stopPropagation()`, so the
  window renew handler never also runs. **Deviation from the plan text:** the QR panel says "Press OK for a new code",
  so on an expired / failed code OK on the boxes renews (one create call) and does not open the input; only during a
  429 Retry-After does it open the input. Input `onBlur` refocuses the boxes unless focus went to Try demo.
  Tests: `tests/components.tvConnectScreen.test.ts` (3 new, two fail without the fix). Still unverified on a device.
- **F65** `app/privacy/page.tsx` and `docs/fire-tv-store/listing.md`: "asks for no account or contact details";
  code "expires after 10 minutes and is deleted once the TV connects". Not "deleted after 10 minutes": unclaimed rows
  are swept only on the next create (`lib/tvConnect.ts:55`). Amazon answer "Collects personal information: No" kept.
- **F48** `components/admin/sections/VenuesSection.tsx`: `codesFailed` / `codesAttempt`; non-OK or rejected fetch →
  "Codes didn't load." + Retry. Test `tests/components.adminVenuesDisplayCodes.test.ts`.
- Verified 2026-11-25: `npm run test` 8,064 passed / 13 skipped (618 files), `npm run lint` clean,
  `npx tsc --noEmit` clean. CI hasn't run (not pushed).
