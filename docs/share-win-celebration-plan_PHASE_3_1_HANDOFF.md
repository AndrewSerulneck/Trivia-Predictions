# Share Your Win — Phase 3.1 handoff (web-only review fixes)

**For Andrew:** Done, not committed, not deployed. A failed video in the app's Instagram Story button no longer switches
off the one-tap picture; the failure wording now comes from one place; and a website switch can turn one-tap video off
per phone type. Inert until an app build answers `video`. No cost, no data change. Needs you: say "commit".

**Changed:** `lib/socialShare/shareDestinations.ts` (`failHint` on the native plan), `components/social-share/StoryCaptureModal.tsx`
(failed video → only `video:false`; wording from `plan.failHint`; unused import dropped), `lib/nativeInstagramStories.ts`
(`instagramStoryVideoOff`, used by `getInstagramStorySupport`), tests `instagram-story-caption`, `share-pictures-stability`,
`share-destinations`, `share-celebration-video`, and the plan's Standing rules (Phase 3). Env switch
`NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF` (`ios`/`android`/both; unset/`none` = on) is NOT added to Vercel (unset = on).

**Verified:** `tsc` ✓, source eslint ✓, `npm run test` 522 files / 6,903 passed, `npm run build` ✓.
**State:** branch `main` @ `f0374061`; Phase 3 + 3.1 all uncommitted (never `git checkout` those files). Suggested commits: Phase 3, then 3.1.
**Next: Phase 3.2** (plan §4; Opus 5.5 high): the video crosses the bridge as a file path, and the Android cache keeps one `.mp4`.
First step: read plan "Phase 3.2" and `native/android/.../InstagramStoriesPlugin.java`.
