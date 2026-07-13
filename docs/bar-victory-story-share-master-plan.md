# Bar Victory Story Share + Camera Filter Master Plan

Plan compiled 2026-07-11 for the current Hightop Challenge web app.

This document is the working implementation guide for the new venue-social feature set:
- "Bar Victory Story Share"
- browser-based selfie camera capture with branded overlays
- client-side image flattening
- native mobile share-sheet handoff
- resilient mobile-browser fallbacks
- future readiness for native app wrappers

It is written specifically for the current repo shape, not as a generic mobile-web recipe.

---

## 1. Recommended Model Setup

### Primary recommendation
- **Best overall model for this project work:** `Codex 5.5`
- **Best default intelligence level for planning / architecture / phased refactors:** `High`
- **Use `Extra High / Heavy Thinking` when:**
  - changing multiple gameplay surfaces at once
  - touching shared abstractions across `app/`, `components/`, `lib/`, and `types/`
  - debugging mobile-browser rendering / share fallback edge cases
  - integrating the feature into both Live Trivia and Category Blitz in one pass

### When Codex 5.4 is acceptable
- focused single-file polish
- small prompt-driven CSS/UI revisions
- narrow follow-up fixes after the main architecture is already in place

### Recommended Kimi K2.5 usage
Kimi K2.5 is best used as a **secondary planning and ideation model**, not the primary execution model for this repo.

Best Kimi K2.5 use cases:
- generating alternate overlay copy and caption styles
- exploring camera overlay visual concepts
- reviewing browser fallback matrices
- brainstorming native-app abstraction seams

Less ideal as the main execution model here:
- disciplined multi-file refactors in an established Next.js codebase
- preserving repo-specific conventions around viewport handling, game shells, and client state
- safely wiring feature work into existing gameplay flows without regressions

### Recommended workflow
1. Use `Codex 5.5 High` for each phase plan and implementation.
2. Use `Codex 5.5 Heavy Thinking` for integration milestones and debugging.
3. Use `Kimi K2.5 Thinking / Agent` in parallel only for visual ideation, copy generation, and challenge reviews.

---

## 2. Repo-Specific Architectural Context

### Current integration points
- **Live Trivia postgame UI:** [app/trivia/live/page.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/app/trivia/live/page.tsx:1)
- **Category Blitz completion UI:** [components/category-blitz/CategoryBlitzGame.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/components/category-blitz/CategoryBlitzGame.tsx:1)
- **Viewport synchronization:** [components/ui/ViewportHeightSync.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/components/ui/ViewportHeightSync.tsx:1)
- **Game shell / fullscreen route behavior:** [components/venue/GameLandingExperience.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/components/venue/GameLandingExperience.tsx:1), [components/ui/AppShell.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/components/ui/AppShell.tsx:1)
- **Shared types:** [types/index.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/types/index.ts:1)
- **Session / venue identity storage:** [lib/storage.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/storage.ts:1)
- **Analytics client:** [lib/analytics.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/analytics.ts:1)

### Key architectural conclusions
- The feature should be implemented as a **client-only capability layer** plus reusable share UI components.
- The camera/share flow should be launched from **postgame surfaces**, not from a top-level route.
- The image composition engine should be **pure and portable**, separate from browser APIs.
- The web-specific parts should be contained behind a **platform adapter boundary** so a later iOS/Android shell can reuse the rendering core.

---

## 3. Target File Structure

Recommended new files:

```text
docs/
  bar-victory-story-share-master-plan.md

components/social-share/
  StoryShareLauncher.tsx
  StoryCaptureModal.tsx
  CameraViewport.tsx
  StoryOverlayEditor.tsx
  ShareActionsSheet.tsx
  StoryShareStatusToast.tsx

lib/socialShare/
  contracts.ts
  deviceCapabilities.ts
  cameraSession.ts
  storyAssets.ts
  storyCanvas.ts
  storyPayloads.ts
  sharePipeline.ts
  deepLinks.ts
  copyPresets.ts
  platform/
    webStoryPlatform.ts

public/story-frames/
  live-trivia/default.png
  live-trivia/champion.png
  category-blitz/default.png
  category-blitz/champion.png
```

Likely modified existing files:
- [types/index.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/types/index.ts:1)
- [app/globals.css](/Users/andrewserulneck/Documents/Trivia-Predictions/app/globals.css:1)
- [app/trivia/live/page.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/app/trivia/live/page.tsx:1)
- [components/category-blitz/CategoryBlitzGame.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/components/category-blitz/CategoryBlitzGame.tsx:1)
- [lib/analytics.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/analytics.ts:1)
- optionally [app/api/analytics/events/route.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/app/api/analytics/events/route.ts:1)

---

## 4. Shared Type Additions

Add these types in [types/index.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/types/index.ts:1) or in `lib/socialShare/contracts.ts` if you want them kept domain-local:

```ts
export type StoryShareGameType = "live-trivia" | "category-blitz";

export type StoryShareTemplateVariant =
  | "default"
  | "champion"
  | "top3"
  | "funny"
  | "minimal";

export type StoryShareFallbackMode =
  | "web-share"
  | "download"
  | "deep-link"
  | "copy-only";

export type CameraPermissionState =
  | "unknown"
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported";

export interface StorySharePayload {
  gameType: StoryShareGameType;
  venueId: string;
  venueName: string | null;
  userId: string;
  username: string;
  title: string;
  subtitle?: string | null;
  funnyCaption?: string | null;
  finalRank?: number | null;
  finalPoints?: number | null;
  correctRate?: number | null;
  isChampion?: boolean;
  achievedAtIso: string;
}

export interface StoryShareCapabilitySnapshot {
  hasMediaDevices: boolean;
  hasFrontCamera: boolean;
  canWebShare: boolean;
  canShareFiles: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  instagramDeepLinkLikely: boolean;
  facebookDeepLinkLikely: boolean;
}

export interface StoryTextBlock {
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  font: string;
  color: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface StoryRenderSpec {
  width: number;
  height: number;
  mirrorPreview: boolean;
  frameAssetUrl: string;
  textBlocks: StoryTextBlock[];
}
```

---

## 5. Build Strategy

### Rollout order
1. Template-only share flow from postgame stats
2. Camera permission + front-camera preview
3. Canvas flattening
4. Web Share API handoff
5. Download + deep-link fallbacks
6. Shared analytics and native-app abstraction

### Why this order
- It gives you a shippable marketing feature before the hardest browser hardware edge cases.
- It reduces debugging scope.
- It lets the capture UI inherit already-working share payloads.

---

## 6. Phase Plan

## Phase 1: Local Device Capability & Hardware Integration

### Goal
Create a browser-safe, mobile-first camera capability layer and fullscreen capture UI that works cleanly in Safari on iPhone and Chrome on Android.

### Sub-phase 1A: Contracts and capability detection

#### Files
Create:
- `lib/socialShare/contracts.ts`
- `lib/socialShare/deviceCapabilities.ts`

Modify:
- [types/index.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/types/index.ts:1) if you want the types globally shared

#### Deliverables
- feature detection helpers
- platform heuristics
- stable return shape for UI gating

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Create the initial social share contracts and device capability layer for this repo.

Context:
- Next.js App Router web app
- mobile-first PWA
- immediate target is Safari on iPhone and Chrome on Android
- this feature is for a postgame social sharing flow with optional camera capture

Please inspect the current repo and then implement:

1. A new `lib/socialShare/contracts.ts` file that defines:
   - StoryShareGameType
   - StoryShareTemplateVariant
   - StoryShareFallbackMode
   - CameraPermissionState
   - StorySharePayload
   - StoryShareCapabilitySnapshot
   - StoryTextBlock
   - StoryRenderSpec

2. A new `lib/socialShare/deviceCapabilities.ts` file that exposes repo-friendly browser capability helpers:
   - detectStoryShareCapabilities()
   - getCameraPermissionState()
   - isIOSBrowser()
   - isAndroidBrowser()
   - isStandaloneDisplayMode()

Requirements:
- keep this layer pure and client-safe
- no camera prompt yet
- no DOM-heavy UI code in this phase
- prefer conservative heuristics over optimistic assumptions
- align style and TS conventions with the existing repo

After implementing, summarize the public functions and any assumptions.
```

---

### Sub-phase 1B: Camera session manager

#### Files
Create:
- `lib/socialShare/cameraSession.ts`

#### Deliverables
- front-camera request flow
- fallback constraints
- normalized errors
- explicit cleanup helpers

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Build the browser camera session layer for the new social share feature.

Use the repo's new `lib/socialShare/contracts.ts` and add `lib/socialShare/cameraSession.ts`.

Implement:
- a helper to request the front-facing camera with mobile-friendly constraints
- graceful fallback when exact constraints are rejected
- a normalized error type / error mapping helper for:
  - permission denied
  - no camera
  - insecure context
  - unsupported browser
  - unknown failure
- a cleanup helper that safely stops all tracks

Constraints:
- target mobile Safari and mobile Chrome first
- use `facingMode: "user"` where possible
- avoid auto-requesting permission on module load
- this file should not render UI
- keep it future-compatible with a later native adapter boundary

Please inspect existing viewport/mobile patterns in the repo before coding.
Then implement the module and explain how the UI should use it.
```

---

### Sub-phase 1C: Fullscreen capture modal and viewport-safe camera UI

#### Files
Create:
- `components/social-share/StoryCaptureModal.tsx`
- `components/social-share/CameraViewport.tsx`

Modify:
- [app/globals.css](/Users/andrewserulneck/Documents/Trivia-Predictions/app/globals.css:1)

#### Deliverables
- fullscreen modal
- `var(--tp-vh)`-safe layout
- safe-area handling
- camera preview shell

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Implement the first-pass fullscreen capture UI for the social share feature.

Please inspect the repo's mobile fullscreen patterns first, especially:
- ViewportHeightSync
- GameLandingExperience
- AppShell
- existing `var(--tp-vh)` usage

Then create:
- `components/social-share/StoryCaptureModal.tsx`
- `components/social-share/CameraViewport.tsx`

And update:
- `app/globals.css`

Requirements:
- fullscreen mobile-first modal
- uses `height: var(--tp-vh, 100dvh)` patterns compatible with this repo
- safe-area padding for top and bottom controls
- includes a video preview surface using `playsInline`, `muted`, `autoPlay`
- includes placeholder overlay chrome for future template/frame content
- no canvas capture yet
- no sharing yet
- support states for:
  - permission not requested
  - requesting permission
  - camera active
  - permission denied / unsupported

Please keep styling consistent with the app's dark visual language and avoid introducing a new route.
After implementing, summarize how this modal should be mounted from game pages.
```

---

## Phase 2: Client-Side Rendering Canvas Engine

### Goal
Compose exported story images entirely on-device using video frame data, branded assets, and dynamic text.

### Sub-phase 2A: Story frame assets and render-spec builders

#### Files
Create:
- `lib/socialShare/storyAssets.ts`
- `lib/socialShare/storyPayloads.ts`

Add assets:
- `public/story-frames/live-trivia/default.png`
- `public/story-frames/category-blitz/default.png`

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Implement the asset and payload preparation layer for the story-share feature.

Create:
- `lib/socialShare/storyAssets.ts`
- `lib/socialShare/storyPayloads.ts`

Goals:
1. Map a `StorySharePayload` + template variant to the correct frame asset URL.
2. Build a normalized render-oriented payload that the future canvas engine can use without knowing game-specific page logic.

Requirements:
- support at least Live Trivia and Category Blitz
- allow template branching for champion/default variants
- keep it pure and deterministic
- prepare for future custom caption editing

Please inspect the current postgame data shapes in:
- `app/trivia/live/page.tsx`
- `components/category-blitz/CategoryBlitzGame.tsx`

Then design the payload builder layer so those surfaces can feed it cleanly.
Do not implement canvas rendering yet.
```

---

### Sub-phase 2B: Canvas composition engine

#### Files
Create:
- `lib/socialShare/storyCanvas.ts`

#### Deliverables
- export-size rendering
- video cover crop
- PNG frame composition
- dynamic text drawing
- blob output

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `Extra High / Heavy Thinking`

```text
Build the canvas rendering engine for the social share feature.

Create `lib/socialShare/storyCanvas.ts`.

This engine must:
- take a live video element or frame source
- take a `StoryRenderSpec`
- render a final flattened portrait image
- output a Blob suitable for conversion to a File for Web Share API

Requirements:
- target 1080x1920 export by default
- do not tie export quality to CSS display size
- use a cover-style crop from source video to portrait output
- support mirrored preview behavior without forcing mirrored export unless explicitly configured
- draw:
  - video frame
  - PNG frame overlay
  - multiple text blocks
- return clear errors for missing video dimensions, missing 2D context, and failed asset loading

Important:
- guard against high-DPI / Retina scaling mistakes
- keep DOM capture libraries out of this solution
- keep the module pure and portable

After implementing, explain:
1. how preview size differs from export size
2. how you handled video crop math
3. how this can later be reused in a native app wrapper
```

---

### Sub-phase 2C: Overlay editor and capture trigger wiring

#### Files
Create:
- `components/social-share/StoryOverlayEditor.tsx`

Modify:
- `components/social-share/StoryCaptureModal.tsx`

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Wire the capture UI into the new story canvas engine.

Create:
- `components/social-share/StoryOverlayEditor.tsx`

Modify:
- `components/social-share/StoryCaptureModal.tsx`

Requirements:
- allow editing a funny caption / optional custom caption
- show a live preview overlay over the camera viewport
- on capture, render a final flattened image blob via the new canvas engine
- store the result in component state for the next share step
- keep the UI responsive on mobile
- avoid layout shifts when toggling between preview/edit/captured states

Constraints:
- no server upload
- no share-sheet handoff yet
- use repo styling conventions
- keep touch targets mobile-friendly

After implementing, summarize the capture state machine.
```

---

## Phase 3: Native Ecosystem Hand-Off & Web Share Pipeline

### Goal
Turn the captured image into a mobile-native share flow with robust fallbacks.

### Sub-phase 3A: Web Share API pipeline

#### Files
Create:
- `lib/socialShare/sharePipeline.ts`

#### Deliverables
- blob-to-file conversion
- `navigator.canShare` checks
- `navigator.share` execution
- normalized result object

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Implement the share pipeline for the story-share feature.

Create `lib/socialShare/sharePipeline.ts`.

Requirements:
- convert a captured Blob into a File
- check `navigator.share` and `navigator.canShare({ files })` safely
- attempt a file share with a clean API
- return a normalized result object that distinguishes:
  - shared successfully
  - unsupported
  - canceled
  - failed
- prepare for fallback modes rather than owning the fallback UI itself

Constraints:
- this is for mobile browsers first
- Instagram / Facebook should be treated as OS share targets if available, not assumed
- keep assumptions conservative
- no direct UI rendering in this file

After implementing, explain how game pages or modal UI should interpret each result branch.
```

---

### Sub-phase 3B: Download and deep-link fallbacks

#### Files
Create:
- `lib/socialShare/deepLinks.ts`
- `components/social-share/ShareActionsSheet.tsx`

#### Deliverables
- download fallback
- Instagram / Facebook best-effort deep links
- clear UI branching

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Implement the fallback flow for the social share feature.

Create:
- `lib/socialShare/deepLinks.ts`
- `components/social-share/ShareActionsSheet.tsx`

Requirements:
- provide a fallback when Web Share API file sharing is unavailable or rejected
- support:
  - direct download/save of the image
  - best-effort Instagram deep link
  - best-effort Facebook deep link if useful
  - clear guidance text when native story-target sharing is not available
- keep the UX honest: do not imply that Instagram Stories handoff is guaranteed in all browsers

Constraints:
- mobile browser first
- user should retain access to the captured image even if deep linking fails
- no server storage

Please design the UI copy so it matches the realities of Safari and Chrome mobile limitations.
```

---

### Sub-phase 3C: Capture-to-share modal flow integration

#### Files
Modify:
- `components/social-share/StoryCaptureModal.tsx`
- optionally add `components/social-share/StoryShareStatusToast.tsx`

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Integrate the full capture-to-share flow inside the story share modal.

Use the existing camera, canvas, and share pipeline layers already added in this repo.

Requirements:
- modal states should now include:
  - pre-permission
  - camera live
  - captured preview
  - sharing in progress
  - share success
  - fallback actions
- keep the flow smooth on mobile
- preserve the captured image for retries/fallbacks
- avoid accidental state loss when share is canceled

Please keep the implementation cleanly separated so this modal remains reusable from both Live Trivia and Category Blitz postgame screens.
```

---

## Phase 4: Future Native App Readiness

### Goal
Create a stable seam so the rendering engine survives a future native app shell while web-only APIs stay isolated.

### Sub-phase 4A: Platform adapter boundary

#### Files
Create:
- `lib/socialShare/platform/webStoryPlatform.ts`

Modify:
- `lib/socialShare/contracts.ts`
- `lib/socialShare/cameraSession.ts`
- `lib/socialShare/sharePipeline.ts`

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `Extra High / Heavy Thinking`

```text
Refactor the story-share feature around a web platform adapter boundary so the canvas/rendering core can later be reused in a native app shell.

Create:
- `lib/socialShare/platform/webStoryPlatform.ts`

Update the surrounding socialShare modules so the responsibilities are clearly split between:
- pure shared logic
- web-only platform logic

Design a platform interface that covers at least:
- capability detection
- camera acquisition
- frame capture input
- image file sharing
- fallback save/download behavior
- external app / deep-link opening

Constraints:
- do not over-engineer
- keep the current web implementation simple
- make the native migration path obvious
- preserve existing behavior

After refactoring, explain:
1. which modules are now pure and portable
2. which modules are web-only
3. what a future React Native / native-shell adapter would need to implement
```

---

### Sub-phase 4B: Analytics and observability

#### Files
Modify:
- [lib/analytics.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/lib/analytics.ts:1)
- optionally [app/api/analytics/events/route.ts](/Users/andrewserulneck/Documents/Trivia-Predictions/app/api/analytics/events/route.ts:1)

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Add analytics instrumentation for the story-share feature using the repo's existing analytics patterns.

Inspect the current analytics client/server code first, then add events for:
- story_share_opened
- story_camera_permission_result
- story_capture_completed
- story_share_attempted
- story_share_completed
- story_share_fallback_used

Requirements:
- align with the existing analytics queue/session architecture
- avoid blocking UX on analytics failures
- include enough event metadata to compare Live Trivia vs Category Blitz usage

After implementation, summarize the event schema and where each event fires.
```

---

## 7. Gameplay Integration Plan

## Live Trivia integration

### Recommended insertion point
Use the existing postgame derived data block in [app/trivia/live/page.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/app/trivia/live/page.tsx:280) and the existing postgame UI area around [app/trivia/live/page.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/app/trivia/live/page.tsx:1320).

### Sub-phase 5A: Add launcher to Live Trivia postgame

#### Files
Create:
- `components/social-share/StoryShareLauncher.tsx`

Modify:
- [app/trivia/live/page.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/app/trivia/live/page.tsx:1)

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Integrate the social share launcher into the Live Trivia postgame experience.

Please inspect the current Live Trivia postgame state and UI in `app/trivia/live/page.tsx`.

Then:
- create a reusable `components/social-share/StoryShareLauncher.tsx`
- add a share CTA to the Live Trivia postgame flow
- build a `StorySharePayload` from existing Live Trivia postgame data:
  - venue name
  - username
  - final rank
  - final points
  - correct rate
  - champion status

Requirements:
- no extra database fetches
- derive data from state already present on the page
- keep the postgame UI visually consistent
- launcher should open the shared social-share modal flow

After implementing, summarize exactly where the payload is built and which fields are derived from existing state.
```

---

## Category Blitz integration

### Recommended insertion point
Use `CompleteScreen` and nearby completion logic in [components/category-blitz/CategoryBlitzGame.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/components/category-blitz/CategoryBlitzGame.tsx:350).

### Sub-phase 5B: Add launcher to Category Blitz completion screen

#### Files
Modify:
- [components/category-blitz/CategoryBlitzGame.tsx](/Users/andrewserulneck/Documents/Trivia-Predictions/components/category-blitz/CategoryBlitzGame.tsx:1)

#### Prompt
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Integrate the social share launcher into the Category Blitz completion screen.

Please inspect `components/category-blitz/CategoryBlitzGame.tsx`, especially the `CompleteScreen` and surrounding completion-state logic.

Add a share CTA that:
- builds a `StorySharePayload` from existing completion data
- launches the shared social-share modal
- supports both champion and non-champion variants

Requirements:
- no extra backend fetch
- derive data from current completion state and existing user/venue state
- keep the visual tone aligned with Category Blitz completion UI
- do not duplicate the share implementation already used by Live Trivia

After implementing, summarize which fields were mapped from Category Blitz completion state.
```

---

## 8. Visual / Copy Design Prompt Set

These prompts are best for Kimi K2.5 or Codex when you want design exploration rather than direct code execution.

### Prompt: Overlay copy variants
**Model:** `Kimi K2.5`
**Mode:** `Thinking`

```text
Generate 30 short social-story caption options for a bar-trivia winner flow.

Context:
- audience is people at a bar or restaurant
- tone should be funny, lightly braggy, social, and venue-friendly
- used for either Live Trivia or Category Blitz
- captions must fit inside a mobile story overlay without being too long

Please produce:
- 10 funny captions
- 10 confident / braggy captions
- 10 more polished brand-safe captions

Each caption should be short enough to fit on a mobile story image.
Avoid cringe, avoid overusing slang, and avoid anything that sounds like generic ad copy.
```

### Prompt: Story frame visual direction
**Model:** `Kimi K2.5`
**Mode:** `Agent` or `Thinking`

```text
Create a visual direction brief for two mobile social-story frame overlays:
1. Live Trivia winner story
2. Category Blitz winner story

Constraints:
- must work over a selfie camera image
- should feel nightlife / bar-energy / game-night, not corporate SaaS
- should leave enough safe space for face visibility
- should support dynamic fields like venue name, final rank, and score
- should feel native to Instagram Stories proportions

Please provide:
- color direction
- placement zones
- typography direction
- safe areas for face / text / CTA
- differences between champion vs standard variants
```

---

## 9. Verification Prompt Set

### Prompt: End-to-end flow verification
**Model:** `Codex 5.5`
**Intelligence:** `High`

```text
Verify the social share feature end to end in this repo.

Please inspect the implementation and validate:
- Live Trivia postgame launcher
- Category Blitz completion launcher
- camera permission flow
- live preview behavior
- capture output generation
- Web Share API path
- fallback download/deep-link path
- analytics event firing points

Focus on likely mobile-browser bugs:
- preview/export mirroring mismatch
- blurry export on high-DPI devices
- viewport jump when keyboard opens
- modal safe-area problems
- state loss after canceled share
- memory leaks from unreleased media tracks or blobs

Report findings first, ordered by severity, with file references.
If no bugs are found, explicitly say so and note residual risks.
```

### Prompt: Cross-browser fallback review
**Model:** `Kimi K2.5`
**Mode:** `Thinking`

```text
Review this mobile-web social sharing flow conceptually for Safari on iPhone and Chrome on Android:
- front camera in browser
- canvas export to image blob
- Web Share API file handoff
- download fallback
- deep link fallback to Instagram / Facebook

Please provide:
- likely failure points by browser
- UX wording recommendations for fallback screens
- where expectations should be softened because behavior is best-effort
- the 5 highest-risk edge cases to test manually
```

---

## 10. Known Risks and Guardrails

### Technical risks
- iOS Safari may allow camera preview but still behave inconsistently during file share handoff.
- Deep links to Instagram/Facebook are best-effort only.
- Preview mirroring and export mirroring can easily diverge if handled implicitly.
- Large portrait canvases can create memory pressure on older devices.
- Keyboard-open viewport changes can break overlay controls if `var(--tp-vh)` is not respected.

### Guardrails
- Never assume `navigator.share` implies `navigator.canShare({ files })`.
- Never tie export resolution to displayed CSS size.
- Never keep old camera streams alive after modal close.
- Never imply guaranteed Instagram Stories publishing.
- Prefer explicit state machines over ad hoc booleans in the modal flow.

---

## 11. Suggested Execution Order

1. Phase 1A
2. Phase 1B
3. Phase 1C
4. Phase 2A
5. Phase 2B
6. Phase 2C
7. Phase 3A
8. Phase 3B
9. Phase 3C
10. Phase 5A
11. Phase 5B
12. Phase 4A
13. Phase 4B
14. Verification pass

### Why this order
- it ships value early
- it keeps hardware/browser complexity isolated
- it avoids mixing UI integration with low-level rendering too early
- it preserves a clean native-app migration seam

---

## 12. Fast Prompt Index

If you only need the next prompt quickly:

- **Capability layer:** Phase 1A, `Codex 5.5 High`
- **Camera session:** Phase 1B, `Codex 5.5 High`
- **Fullscreen modal UI:** Phase 1C, `Codex 5.5 High`
- **Payload builders:** Phase 2A, `Codex 5.5 High`
- **Canvas engine:** Phase 2B, `Codex 5.5 Heavy Thinking`
- **Capture wiring:** Phase 2C, `Codex 5.5 High`
- **Web Share API:** Phase 3A, `Codex 5.5 High`
- **Fallbacks:** Phase 3B, `Codex 5.5 High`
- **Modal integration:** Phase 3C, `Codex 5.5 High`
- **Live Trivia hook-in:** Phase 5A, `Codex 5.5 High`
- **Category Blitz hook-in:** Phase 5B, `Codex 5.5 High`
- **Platform adapter refactor:** Phase 4A, `Codex 5.5 Heavy Thinking`
- **Analytics:** Phase 4B, `Codex 5.5 High`
- **Design/copy ideation:** Kimi K2.5 Thinking / Agent
- **Final QA review:** `Codex 5.5 High`
