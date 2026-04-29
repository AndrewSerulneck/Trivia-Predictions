# Responsive Mobile Workplan (iPhone SE First)

## Problem Statement
Some pages render oversized on narrow mobile screens (especially iPhone SE class widths). Symptoms include oversized controls, excessive header chrome, unpredictable text inflation, and occasional horizontal overflow.

## Root-Cause Categories Audited
1. Viewport configuration and mobile browser scaling behavior.
2. iOS text inflation (`-webkit-text-size-adjust`) and root font scaling.
3. Fixed/full viewport width usage (`100vw`/`100dvw`) that can exceed safe layout width.
4. Components lacking `min-width: 0` in flex/grid contexts.
5. Non-wrapping text (`whitespace-nowrap`) and fixed min widths.
6. Global control chrome (large borders/shadows) too heavy for narrow screens.
7. Excessive fixed header + spacer heights on short viewports.
8. Nested content blocks without max-width guards.

## System Fixes Implemented
- Global border-box sizing for all elements.
- Media max-width constraints (`img/svg/video/canvas/iframe`).
- `tp-page-main` descendant width guards (`min-width: 0`, `max-width: 100%`).
- Narrow-screen root typography scaling:
  - <=430px: `html { font-size: 14px; }`
  - <=380px: `html { font-size: 13px; }`
- iOS inflation clamp on narrow screens:
  - `text-size-adjust: none; -webkit-text-size-adjust: none;`
- Small-screen global chrome reduction:
  - Smaller border widths/radius/shadows for cards, controls, inputs.
- Reduced compact header spacer heights in `PageShell`.
- Pick 'Em-specific compact styling and wrapping fixes.

## Ongoing Guardrails (Must Follow For New Pages)
1. Never use `w-screen`/`100vw` in content containers.
2. Use `w-full min-w-0 max-w-full` for page-level blocks.
3. In flex/grid children, always set `min-w-0` where text may grow.
4. Prefer wrapping text; avoid `whitespace-nowrap` unless inside explicit horizontal scrollers.
5. For horizontal rails, isolate them in `overflow-x-auto` wrappers only.
6. Use responsive typography (`text-xs sm:text-sm` patterns) for dense mobile views.
7. Keep top fixed header height minimal; avoid stacking large persistent bars.

## Verification Checklist (Per Page)
- iPhone SE width (375x667): no clipped content, no forced horizontal pan.
- Narrow Android width (360x740): no clipped content, controls remain tappable.
- `document.documentElement.scrollWidth <= window.innerWidth` during idle state.
- Inputs/buttons remain readable and interactable at compact sizes.

## Follow-up Automation (Next Step)
Add a dev-only runtime assertion helper that logs overflowing elements (`getBoundingClientRect().right > viewportWidth`) and fails CI snapshots when regression is detected.
