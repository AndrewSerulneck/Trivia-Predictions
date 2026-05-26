# Claude: Design System Migration — Phase 1

## Your Mission

Migrate **Hightop Challenge** from a legacy "comic card" design to a new "dark broadcast" design system. This is **Phase 1 of 4** — you're establishing the CSS foundation.

**Files to edit:** 2  
**Edits total:** 4  
**Estimated time:** 1.5–2 hours  

After you're done, the website won't *look* different yet (because components still use old class names), but the CSS tokens will be in place so later phases cascade effortlessly.

---

## Context: What's Changing

### The two design languages

| **LEGACY** | **NORTH STAR** |
|---|---|
| Cream backgrounds `#fff9f0` | Dark slate `#020617` |
| `.tp-comic-card` (cream + 8px shadow) | `.ht-dark-card` (`#0f172a` + hairline) |
| Kalam font (handwritten) | Bree Serif + Nunito 600–900 |
| Brown/tan borders | White/rgba borders (8–20% alpha) |
| `.bg-stadium-turf` texture | Flat dark, accents only |

Your job: **eliminate legacy, establish north star foundations**.

### What the new system defines

- **9 semantic accent colors** (cyan=home, amber=leaderboard, emerald=success, rose=error, etc.)
- **5 game identities** (each has its own gradient: Live Trivia, Speed Trivia, Bingo, Pick 'Em, Fantasy)
- **Unified typography** (Bree Serif for titles, Nunito for UI, tabular numerals for numbers)
- **Atomic tokens** (3 shadows, 6 radii, 9-space grid, consistent everywhere)

### Key reference

Inside `/design-system/project/colors_and_type.css` are **all the tokens you need**. This prompt provides excerpts; if you need to verify, that's the source of truth.

---

## THE WORK: 4 edits, 2 files

### Edit 1: `/app/globals.css` — Replace the entire `:root` section

**Where:** Lines 1–29 (the font import + `:root` block)  
**What:** Remove Kalam, update all color tokens from `--tp-*` to `--ht-*`  
**Why:** Foundation for every other token in the codebase

**Current code (lines 1–29):**
```css
@import url("https://fonts.googleapis.com/css2?family=Bree+Serif&family=Kalam:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap");

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;
  --tp-vh: 100svh;
  --tp-ink: #1f2a36;
  --tp-cream: #f7ede0;
  --tp-gold: #d89a4f;
  --tp-orange: #c96b40;
  --tp-red: #a64534;
  --tp-umber: #853626;
  /* Dark canvas system */
  --tp-canvas: #020617;
  --tp-surface: #0f172a;
  --tp-elevated: #1e293b;
  --tp-border-subtle: #334155;
  --tp-text-primary: #f8fafc;
  --tp-text-muted: #94a3b8;
  /* Stripe vars kept for bingo/legacy */
  --stripe-height: 80px;
  --stripe-green-a: #4ade80;
  --stripe-green-b: #6ee89a;
}
```

**Replace with (new foundation):**
```css
@import url("https://fonts.googleapis.com/css2?family=Bree+Serif&family=Nunito:wght@400;600;700;800;900&display=swap");

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: dark;

  /* -----------------------------------------------------------
     CANVAS & SURFACES
     Every player-facing surface is dark. There is no light mode.
     ----------------------------------------------------------- */
  --ht-canvas:          #020617;   /* page background (slate-950)        */
  --ht-surface:         #0f172a;   /* card / panel default (slate-900)   */
  --ht-elevated:        #1e293b;   /* nested panel / input (slate-800)   */
  --ht-elevated-2:      #334155;   /* highest nested level (slate-700)   */

  /* Borders — always rgba on dark, never pure slate-200 / gray-200       */
  --ht-border-hairline: rgba(255, 255, 255, 0.08);  /* default card edge  */
  --ht-border-soft:     rgba(255, 255, 255, 0.12);  /* button/input edge  */
  --ht-border-strong:   rgba(255, 255, 255, 0.20);  /* tabs, dividers     */

  /* -----------------------------------------------------------
     TEXT — dark surface rules
     ----------------------------------------------------------- */
  --ht-fg-primary:      #f8fafc;   /* slate-50  — body, headings         */
  --ht-fg-secondary:    #e2e8f0;   /* slate-200 — secondary body         */
  --ht-fg-muted:        #94a3b8;   /* slate-400 — labels, captions       */
  --ht-fg-dim:          #64748b;   /* slate-500 — placeholder only       */

  /* -----------------------------------------------------------
     ACCENT COLORS — "the accent tells you where you are"
     ----------------------------------------------------------- */

  /* Cyan — Live Trivia, primary informational, focus rings           */
  --ht-cyan-50:   #ecfeff;
  --ht-cyan-200:  #a5f3fc;
  --ht-cyan-300:  #67e8f9;
  --ht-cyan-400:  #22d3ee;
  --ht-cyan-500:  #06b6d4;
  --ht-cyan-600:  #0891b2;

  /* Emerald — Speed Trivia "answering" state, success, +points     */
  --ht-emerald-200: #a7f3d0;
  --ht-emerald-300: #6ee7b7;
  --ht-emerald-400: #34d399;
  --ht-emerald-500: #10b981;
  --ht-emerald-600: #059669;

  /* Amber — countdowns, "next up" status, closest-guess flag       */
  --ht-amber-200: #fde68a;
  --ht-amber-300: #fcd34d;
  --ht-amber-400: #fbbf24;
  --ht-amber-500: #f59e0b;

  /* Fuchsia — answer reveal, intermission, "between" states        */
  --ht-fuchsia-200: #f5d0fe;
  --ht-fuchsia-300: #f0abfc;
  --ht-fuchsia-400: #e879f9;
  --ht-fuchsia-500: #d946ef;

  /* Indigo / Violet — Pick'Em, Fantasy                              */
  --ht-indigo-400: #818cf8;
  --ht-indigo-500: #6366f1;
  --ht-violet-400: #a78bfa;
  --ht-violet-500: #8b5cf6;
  --ht-violet-600: #7c3aed;

  /* Rose — wrong answer, errors, forfeit                            */
  --ht-rose-300: #fda4af;
  --ht-rose-400: #fb7185;
  --ht-rose-500: #f43f5e;

  /* -----------------------------------------------------------
     THE EXIT PILL — the ONLY warm element on screen
     ----------------------------------------------------------- */
  --ht-exit-from:   #a93d3a;
  --ht-exit-via:    #c8573e;
  --ht-exit-to:     #e9784e;
  --ht-exit-text:   #fff7ea;
  --ht-exit-border: #1c2b3a;

  /* -----------------------------------------------------------
     PAGE-LEVEL ACCENTS — what color a non-game screen takes
     ----------------------------------------------------------- */
  --ht-page-home:        #06b6d4;       /* cyan — Venue Hub, Join, Login */
  --ht-page-leaderboard: #f59e0b;       /* amber */
  --ht-page-activity:    #60a5fa;       /* blue-400 */
  --ht-page-prizes:      #d89a4f;       /* gold */
  --ht-page-faqs:        #94a3b8;       /* slate-400 */
  --ht-page-danger:      #f43f5e;       /* rose */
  --ht-page-notify:      #06b6d4;       /* cyan */

  /* -----------------------------------------------------------
     GAME COLOR IDENTITIES
     ----------------------------------------------------------- */
  /* Live Trivia — Broadcast (cyan → blue → violet) */
  --ht-game-live:        linear-gradient(132deg, #0ea5e9 0%, #2563eb 42%, #7c3aed 100%);
  --ht-game-live-tint:   linear-gradient(132deg, rgba(14,165,233,0.20) 0%, rgba(37,99,235,0.24) 42%, rgba(124,58,237,0.26) 100%);
  --ht-game-live-edge:   #67e8f9;
  --ht-game-live-primary:  #06b6d4;
  --ht-game-live-secondary:#10b981;

  /* Speed Trivia — Racing electricity (yellow + lime stripes on black) */
  --ht-game-trivia:        #facc15;
  --ht-game-trivia-base:   #0a0a0f;
  --ht-game-trivia-stripe: linear-gradient(115deg,
                              transparent 0 22px,
                              rgba(250,204,21,0.92) 22px 30px,
                              transparent 30px 38px,
                              rgba(132,204,22,0.85) 38px 44px,
                              transparent 44px 62px);
  --ht-game-trivia-edge:   #facc15;
  --ht-game-trivia-primary:  #facc15;
  --ht-game-trivia-secondary:#84cc16;

  /* Sports Bingo — Casino felt + cool ice border (NOT warm) */
  --ht-game-bingo:        radial-gradient(120% 80% at 50% 0%, rgba(255,215,128,0.10), transparent 60%),
                          radial-gradient(circle at 20% 80%, rgba(0,0,0,0.45), transparent 60%),
                          #0c3a2e;
  --ht-game-bingo-base:   #0c3a2e;
  --ht-game-bingo-trim:   #c89b3a;
  --ht-game-bingo-edge:   #7dd3fc;
  --ht-game-bingo-primary:  #f97316;
  --ht-game-bingo-secondary:#f59e0b;

  /* Pick 'Em — Sportsbook ticket (navy ↔ magenta split) */
  --ht-game-pickem:       linear-gradient(115deg, #1a2f72 0%, #1a2f72 48%, #6b1a4e 52%, #6b1a4e 100%);
  --ht-game-pickem-edge:  #fde68a;
  --ht-game-pickem-primary:  #4f46e5;
  --ht-game-pickem-secondary:#06b6d4;

  /* Fantasy — Coach's chalkboard (deep forest + chalk) */
  --ht-game-fantasy:      #0a3128;
  --ht-game-fantasy-edge: rgba(254, 243, 199, 0.55);
  --ht-game-fantasy-primary:  #7c3aed;
  --ht-game-fantasy-secondary:#06b6d4;

  /* -----------------------------------------------------------
     FOCUS RING — always cyan, always 2px halo
     ----------------------------------------------------------- */
  --ht-focus-ring: 0 0 0 2px rgba(34, 211, 238, 0.36);

  /* -----------------------------------------------------------
     SHADOWS — dark-native. Exactly three.
     ----------------------------------------------------------- */
  --ht-shadow-card:    0 8px 24px rgba(0, 0, 0, 0.40);
  --ht-shadow-modal:   0 20px 60px rgba(0, 0, 0, 0.55);
  --ht-shadow-glow-cyan:  0 0 0 1px rgba(34, 211, 238, 0.30), 0 8px 28px rgba(34, 211, 238, 0.18);

  /* -----------------------------------------------------------
     RADII
     ----------------------------------------------------------- */
  --ht-radius-sm:    8px;
  --ht-radius-md:    12px;
  --ht-radius-lg:    16px;
  --ht-radius-xl:    20px;
  --ht-radius-2xl:   24px;
  --ht-radius-pill:  9999px;

  /* -----------------------------------------------------------
     SPACING — 4px grid
     ----------------------------------------------------------- */
  --ht-space-1: 4px;
  --ht-space-2: 8px;
  --ht-space-3: 12px;
  --ht-space-4: 16px;
  --ht-space-5: 20px;
  --ht-space-6: 24px;
  --ht-space-8: 32px;
  --ht-space-10: 40px;
  --ht-space-12: 48px;

  /* -----------------------------------------------------------
     TYPOGRAPHY — primitives
     ----------------------------------------------------------- */
  --ht-font-display: "Bree Serif", Georgia, serif;
  --ht-font-body:    "Nunito", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --ht-font-mono:    ui-monospace, "SF Mono", "JetBrains Mono", "Menlo", monospace;

  /* Type scale — mobile-first */
  --ht-text-xs:   12px;
  --ht-text-sm:   14px;
  --ht-text-base: 16px;
  --ht-text-md:   18px;
  --ht-text-lg:   20px;
  --ht-text-xl:   24px;
  --ht-text-2xl:  30px;
  --ht-text-3xl:  36px;
  --ht-text-4xl:  44px;
  --ht-text-5xl:  56px;

  /* Tracking presets */
  --ht-track-eyebrow: 0.14em;
  --ht-track-title:   0.045em;
  --ht-track-tight:  -0.01em;
}
```

**Key notes:**
- Removed Kalam completely from font import
- Added Nunito weight 900 (for button text)
- Converted all `--tp-*` to `--ht-*` 
- Kept `--tp-vh` (you'll keep this, it's still used for viewport height)
- Added all 5 game gradients + secondary colors
- Added spacing scale, radii, shadows, typography tokens

**After this edit:**
1. Read the file back to verify font import changed
2. Check that `:root` now starts with `--ht-canvas`

---

### Edit 2: `/app/globals.css` — Update `body` and `html` styling

**Where:** Lines 35–70 (the `body` and `html` CSS rules)  
**What:** Change background color and font-family to use new tokens  
**Why:** Makes the page use the new dark canvas

**Current code:**
```css
body {
  font-family: "Nunito", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  @apply text-slate-50 antialiased;
  background-color: var(--tp-canvas);
  background-image: none;
  overflow-x: hidden;
  overflow-y: auto;
  overflow-anchor: none;
  overscroll-behavior-y: auto;
  text-size-adjust: 100%;
  -webkit-text-size-adjust: 100%;
}

html {
  overflow-x: hidden;
  overflow-y: auto;
  overflow-anchor: none;
  text-size-adjust: 100%;
  -webkit-text-size-adjust: 100%;
  background-color: var(--tp-canvas);
  background-image: none;
}
```

**Replace with:**
```css
body {
  font-family: var(--ht-font-body);
  @apply text-slate-50 antialiased;
  background-color: var(--ht-canvas);
  background-image: none;
  overflow-x: hidden;
  overflow-y: auto;
  overflow-anchor: none;
  overscroll-behavior-y: auto;
  text-size-adjust: 100%;
  -webkit-text-size-adjust: 100%;
}

html {
  overflow-x: hidden;
  overflow-y: auto;
  overflow-anchor: none;
  text-size-adjust: 100%;
  -webkit-text-size-adjust: 100%;
  background-color: var(--ht-canvas);
  background-image: none;
}
```

**Changes:**
- `font-family: var(--ht-font-body)` (was hardcoded)
- `background-color: var(--ht-canvas)` (was `var(--tp-canvas)`)

---

### Edit 3: `/app/globals.css` — Update `.tp-bingo-theme`

**Where:** Lines 50–58 (the `.tp-bingo-theme` rules)  
**What:** Replace the old orange gradient with new bingo canvas + cool-ice border setup  
**Why:** Bingo should still have visual identity but stay within dark broadcast aesthetic

**Current code:**
```css
html.tp-bingo-theme,
body.tp-bingo-theme {
  background-image:
    radial-gradient(circle at 14% 14%, rgba(254, 215, 170, 0.55) 0%, rgba(254, 215, 170, 0) 40%),
    radial-gradient(circle at 84% 86%, rgba(254, 202, 202, 0.4) 0%, rgba(254, 202, 202, 0) 45%),
    linear-gradient(180deg, #fb923c 0%, #f97316 50%, #ea580c 100%);
  background-size: cover, cover, cover;
  background-attachment: fixed;
}
```

**Replace with:**
```css
html.tp-bingo-theme,
body.tp-bingo-theme {
  background-color: var(--ht-canvas);
  background-image: var(--ht-game-bingo);
  background-size: cover;
  background-attachment: fixed;
}
```

**Why:** Bingo now uses `--ht-game-bingo` which is a subtle green felt gradient (stays on-brand) instead of warm orange.

---

### Edit 4: `/app/globals.css` — Add semantic type classes

**Where:** End of file, before or after the animations section (find where animations start)  
**What:** Add new `.ht-*` type classes for semantic markup  
**Why:** Components will use these classes later; establish them now

**Find the animations section in `/app/globals.css`** — it should start with `@keyframes`. Before that section, add:

```css
/* =============================================================
   SEMANTIC TYPOGRAPHY — apply with class names
   ============================================================= */

/* Hero / game title */
.ht-display {
  font-family: var(--ht-font-display);
  font-weight: 400;
  font-size: clamp(2rem, 6.2vw, 3.35rem);
  line-height: 1.02;
  letter-spacing: var(--ht-track-title);
  text-transform: uppercase;
  color: var(--ht-fg-primary);
  text-shadow:
    0 1px 0 rgba(12, 18, 28, 0.80),
    0 3px 0 rgba(12, 18, 28, 0.58),
    0 0 12px rgba(255, 255, 255, 0.50);
}

/* Section title */
.ht-h1 {
  font-family: var(--ht-font-display);
  font-size: var(--ht-text-3xl);
  line-height: 1.05;
  color: var(--ht-fg-primary);
}

/* Card title */
.ht-h2 {
  font-family: var(--ht-font-display);
  font-size: var(--ht-text-2xl);
  line-height: 1.1;
  color: var(--ht-fg-primary);
}

/* Big numerical / question text (Nunito, 800) */
.ht-question {
  font-family: var(--ht-font-body);
  font-weight: 800;
  font-size: var(--ht-text-3xl);
  line-height: 1.1;
  letter-spacing: var(--ht-track-tight);
  color: var(--ht-fg-primary);
}

/* Default body */
.ht-body {
  font-family: var(--ht-font-body);
  font-weight: 600;
  font-size: var(--ht-text-base);
  line-height: 1.4;
  color: var(--ht-fg-secondary);
}

/* Small body / caption */
.ht-caption {
  font-family: var(--ht-font-body);
  font-weight: 600;
  font-size: var(--ht-text-sm);
  line-height: 1.35;
  color: var(--ht-fg-muted);
}

/* Eyebrow — accent-colored, tracked, all-caps */
.ht-eyebrow {
  font-family: var(--ht-font-body);
  font-weight: 900;
  font-size: var(--ht-text-xs);
  letter-spacing: var(--ht-track-eyebrow);
  text-transform: uppercase;
}

/* Tabular numbers for timers/scores */
.ht-tabular {
  font-variant-numeric: tabular-nums;
  font-family: var(--ht-font-body);
  font-weight: 900;
}

```

---

### Edit 5: `/tailwind.config.ts` — Extend theme with new design system

**Where:** The entire `theme.extend` object (lines ~12–33)  
**What:** Add new color scales, animations, shadows, radii, text colors  
**Why:** Tailwind utilities will now use `bg-ht-surface`, `border-ht-hairline`, `text-ht-primary`, etc.

**Current code:**
```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "15%": { transform: "translateX(-8px)" },
          "30%": { transform: "translateX(8px)" },
          "45%": { transform: "translateX(-6px)" },
          "60%": { transform: "translateX(6px)" },
          "75%": { transform: "translateX(-4px)" },
          "90%": { transform: "translateX(4px)" },
        },
      },
      animation: {
        shake: "shake 0.55s ease-in-out",
      },
      colors: {
        brand: {
          orange: "#FF7E33",
          grass: "#22C55E",
          "grass-light": "#86EFAC",
          text: "#1E293B",
        }
      },
    },
  },
  plugins: [],
};

export default config;
```

**Replace `theme.extend` with:**
```typescript
    extend: {
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "15%": { transform: "translateX(-8px)" },
          "30%": { transform: "translateX(8px)" },
          "45%": { transform: "translateX(-6px)" },
          "60%": { transform: "translateX(6px)" },
          "75%": { transform: "translateX(-4px)" },
          "90%": { transform: "translateX(4px)" },
        },
        "tp-glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(6, 182, 212, 0.45)" },
          "50%": { boxShadow: "0 0 0 6px rgba(6, 182, 212, 0)" },
        },
        "ht-pulse": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        shake: "shake 0.55s ease-in-out",
        "tp-glow-pulse": "tp-glow-pulse 2s ease-in-out infinite",
        "ht-pulse": "ht-pulse 2s ease-in-out infinite",
      },
      colors: {
        ht: {
          canvas: "var(--ht-canvas)",
          surface: "var(--ht-surface)",
          elevated: "var(--ht-elevated)",
          "elevated-2": "var(--ht-elevated-2)",
          "border-hairline": "var(--ht-border-hairline)",
          "border-soft": "var(--ht-border-soft)",
          "border-strong": "var(--ht-border-strong)",
          "fg-primary": "var(--ht-fg-primary)",
          "fg-secondary": "var(--ht-fg-secondary)",
          "fg-muted": "var(--ht-fg-muted)",
          "fg-dim": "var(--ht-fg-dim)",
          cyan: {
            50: "#ecfeff",
            200: "#a5f3fc",
            300: "#67e8f9",
            400: "#22d3ee",
            500: "#06b6d4",
            600: "#0891b2",
          },
          emerald: {
            200: "#a7f3d0",
            300: "#6ee7b7",
            400: "#34d399",
            500: "#10b981",
            600: "#059669",
          },
          amber: {
            200: "#fde68a",
            300: "#fcd34d",
            400: "#fbbf24",
            500: "#f59e0b",
          },
          fuchsia: {
            200: "#f5d0fe",
            300: "#f0abfc",
            400: "#e879f9",
            500: "#d946ef",
          },
          rose: {
            300: "#fda4af",
            400: "#fb7185",
            500: "#f43f5e",
          },
          exit: {
            from: "#a93d3a",
            via: "#c8573e",
            to: "#e9784e",
            text: "#fff7ea",
            border: "#1c2b3a",
          },
        },
      },
      backgroundColor: {
        "ht-canvas": "var(--ht-canvas)",
        "ht-surface": "var(--ht-surface)",
        "ht-elevated": "var(--ht-elevated)",
      },
      borderColor: {
        "ht-hairline": "var(--ht-border-hairline)",
        "ht-soft": "var(--ht-border-soft)",
        "ht-strong": "var(--ht-border-strong)",
      },
      textColor: {
        "ht-primary": "var(--ht-fg-primary)",
        "ht-secondary": "var(--ht-fg-secondary)",
        "ht-muted": "var(--ht-fg-muted)",
      },
      boxShadow: {
        "ht-card": "var(--ht-shadow-card)",
        "ht-modal": "var(--ht-shadow-modal)",
        "ht-glow-cyan": "var(--ht-shadow-glow-cyan)",
      },
      borderRadius: {
        "ht-sm": "var(--ht-radius-sm)",
        "ht-md": "var(--ht-radius-md)",
        "ht-lg": "var(--ht-radius-lg)",
        "ht-xl": "var(--ht-radius-xl)",
        "ht-2xl": "var(--ht-radius-2xl)",
        "ht-pill": "var(--ht-radius-pill)",
      },
    },
```

---

## Validation & Testing

After all 5 edits are complete, run these checks:

### 1. Start the dev server
```bash
npm run dev
```

### 2. Check for CSS errors
- Open DevTools (F12 or Cmd+Option+I)
- Go to Console
- **Should see 0 CSS parse errors.** If you see red errors about undefined colors or syntax, let me know.

### 3. Spot-check 3 pages
Visit these URLs and verify the background is now dark slate (`#020617`), NOT cream:

- **`http://localhost:3000/`** → Should show dark background, cyan accents
- **`http://localhost:3000/bingo`** → Should show dark background with subtle bingo aesthetic (NOT orange)
- **`http://localhost:3000/trivia/live`** → Should look correct (this page was already on north star)

### 4. Verify fonts loaded
- DevTools → Network tab
- Search for "googleapis"
- **Should see:** Bree Serif + Nunito loading
- **Should NOT see:** Kalam

### 5. Check for legacy colors
Search the codebase for these hex values (they shouldn't exist):
```
#f7ede0  (cream)
#fff9f0  (cream)
#3b2412  (brown)
#f7ede0  (cream)
```

If any appear, that's OK for Phase 1 — those are in components and will be updated in Phase 2.

---

## What Happens Next

Phase 1 is **just the foundation**. The website won't look dramatically different yet because components still use old class names like `.tp-card` and hardcoded colors.

Phase 2 will:
- Rename all component classes from `.tp-*` to `.ht-*`
- Replace hardcoded `#0f172a` with `var(--ht-surface)` throughout
- Update buttons, cards, modals, badges to new design

So don't worry if things look mostly the same after this phase. That's expected!

---

## Summary: What you just established

✅ Removed Kalam font, keeping only Bree Serif + Nunito  
✅ Migrated all color tokens from `--tp-*` to `--ht-*`  
✅ Established atomic spacing, shadow, radius, and typography tokens  
✅ Added all 5 game gradients (Live Trivia, Speed Trivia, Bingo, Pick 'Em, Fantasy)  
✅ Updated Tailwind config to expose new tokens as utilities (`bg-ht-surface`, `text-ht-primary`, etc.)  
✅ Extended dark canvas (`--ht-canvas: #020617`) to entire app  
✅ Added semantic type classes for Phase 2 to reference  

Phase 1 is **done** when all tests pass. Ready to start?
