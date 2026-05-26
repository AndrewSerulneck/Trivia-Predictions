# CLAUDE: DESIGN SYSTEM IMPLEMENTATION — PHASE 1

## Executive Summary

Your task is to migrate the **Hightop Challenge web app** from a **legacy "comic card" visual language** to the **new "dark broadcast" design system**. This is the **first of four focused phases** affecting every player-facing page, component, and utility. The new design system is defined in `/design-system/project/` (Bree Serif + Nunito, dark dark-950 canvas, electric accents).

**Scope:** All player-facing surfaces (not the admin console).  
**This Phase (1):** Design tokens & Tailwind config only.  
**Deliverable:** CSS foundations so subsequent phases can build on atomic, reusable tokens.

**You have access to your full tool suite.** Use `replace_string_in_file` to make edits, `read_file` to verify context, and `run_in_terminal` to test. After completing this phase, run the validation tests (see end of prompt).

---

## BEFORE YOU START: HOW TO USE THIS PROMPT

### Your workflow for this phase

1. **Read the context** (sections below) to understand what's changing
2. **Read the new design tokens** from `/design-system/project/colors_and_type.css` (I'll provide excerpts)
3. **Make each edit** using `replace_string_in_file` tool, with full context (3–5 lines before/after)
4. **Verify each edit** by reading the file back to confirm correctness
5. **After all edits**, run the validation tests (npm dev + spot checks)
6. **Report back** with test results before moving to Phase 2

### Key principles for edits

- **Exact file paths:** Always use absolute paths like `/Users/andrewserulneck/Documents/Trivia-Predictions/app/globals.css`
- **Context matters:** Include 3–5 lines of unchanged code before and after every replacement to avoid ambiguity
- **One edit per section:** I'll guide you through edits step-by-step, not all at once
- **Verify, don't assume:** After each edit, read the file back to confirm the change took effect
- **Ask before deviating:** If you spot something unexpected or need clarification, ask

---

## CONTEXT: What changed — the migration problem

The codebase currently contains **two competing visual languages**:

| LEGACY ("Comic Card") | NORTH STAR ("Dark Broadcast") |
|---|---|
| Backgrounds: cream `#fff9f0`, `#f7ede0` | Backgrounds: slate-950 `#020617` (flat dark only) |
| Cards: `.tp-comic-card` (cream + 8px ink shadow) | Cards: `.tp-dark-card` (`#0f172a` + 1px hairline border) |
| Borders: brown `#3b2412`, tan `border-slate-200` | Borders: white/rgba at 8–20% alpha (`border-cyan-400/60`) |
| Text: slate-700/600 (dark on light) | Text: slate-100/200 (light on dark) |
| Fonts: Kalam (handwritten, comic aesthetic) | Fonts: Bree Serif (game titles) + Nunito 600–900 (UI) |
| Backgrounds: `.bg-stadium-turf` repeating green | Backgrounds: flat dark surface, accent gradients only |

**Your job: eliminate the legacy language entirely and move everything toward the north star.**

### Where to find specifications

- **Design tokens (CSS custom properties):** `/design-system/project/colors_and_type.css`
- **Semantic color meanings:** See the table in `colors_and_type.css` under `--ht-page-*` and `--ht-game-*` sections
- **Canonical example:** `/app/trivia/live/page.tsx` is the realization of the dark broadcast look
- **Component previews:** `/design-system/project/preview/` folder (open any `.html` file in a browser to see live examples)
- **UI Kit (clickable demo):** `/design-system/project/ui_kits/web/index.html`

---

## PHASE 1: DESIGN TOKENS & TAILWIND CONFIG

**Complexity: HIGH**  
**Estimated Duration: 1.5–2 hours**  
**Key Skill:** CSS custom properties, Tailwind theme extension, atomic design

This phase is the foundation. Get this right and everything else cascades correctly.

---

## EDIT 1a: Update `:root` — Color tokens in `/app/globals.css`

### What you're doing

Replacing the entire `:root` CSS custom properties section with new design system tokens. The new tokens use `--ht-*` prefixes (Hightop) instead of `--tp-*` (legacy). You're also removing Kalam from font imports and keeping only Bree Serif + Nunito (weights 400/600/700/800/900).
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

**Action:** Replace with new design system tokens. Import the new fonts first, remove Kalam:

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

  /* Speed Trivia — Electric yellow + lime on near-black */
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

**Note:** Remove all legacy `--tp-*` tokens EXCEPT `--tp-vh` which is still used for viewport height. Keep theme modifiers (`.tp-bingo-theme`, `.tp-admin-theme`) as-is for now; Phase 2 will reskin them.

### 1.2: Update body / html styles in `/app/globals.css`

**Current state (lines 25–70):**
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

**Action:** Update to use new tokens:

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

### 1.3: Update theme modifiers — `.tp-bingo-theme`

**Current state (lines 50–58):**
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

**Action:** Keep the dark broadcast aesthetic even for Bingo. Update to use `--ht-game-bingo` gradient:

```css
html.tp-bingo-theme,
body.tp-bingo-theme {
  background-color: var(--ht-canvas);
  background-image: var(--ht-game-bingo);
  background-size: cover;
  background-attachment: fixed;
}
```

### 1.4: Update theme modifiers — `.tp-admin-theme`

**No changes needed.** Keep admin theme isolated (lines 60–80).

### 1.5: Add semantic type classes at end of `/app/globals.css`

**After the scrollbar rules, add new semantic type layer (before any existing animations section):**

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

.ht-h1 {
  font-family: var(--ht-font-display);
  font-size: var(--ht-text-3xl);
  line-height: 1.05;
  color: var(--ht-fg-primary);
}

.ht-h2 {
  font-family: var(--ht-font-display);
  font-size: var(--ht-text-2xl);
  line-height: 1.1;
  color: var(--ht-fg-primary);
}

.ht-question {
  font-family: var(--ht-font-body);
  font-weight: 800;
  font-size: var(--ht-text-3xl);
  line-height: 1.1;
  letter-spacing: var(--ht-track-tight);
  color: var(--ht-fg-primary);
}

.ht-body {
  font-family: var(--ht-font-body);
  font-weight: 600;
  font-size: var(--ht-text-base);
  line-height: 1.4;
  color: var(--ht-fg-secondary);
}

.ht-caption {
  font-family: var(--ht-font-body);
  font-weight: 600;
  font-size: var(--ht-text-sm);
  line-height: 1.35;
  color: var(--ht-fg-muted);
}

.ht-eyebrow {
  font-family: var(--ht-font-body);
  font-weight: 900;
  font-size: var(--ht-text-xs);
  letter-spacing: var(--ht-track-eyebrow);
  text-transform: uppercase;
}

.ht-tabular {
  font-variant-numeric: tabular-nums;
  font-family: var(--ht-font-body);
  font-weight: 900;
}
```

### 1.6: Update `/tailwind.config.ts` — theme colors

**Current state:**
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

**Action:** Extend with new design system colors and animations:

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
  },
  plugins: [],
};

export default config;
```

### 1.7: Validation & testing

After making these changes:

1. **Start the dev server:** `npm run dev`
2. **Check for CSS errors:** Open DevTools → Console, scroll to top. Should see no CSS parse errors.
3. **Spot-check a few pages:**
   - Visit `/` (home/join) — background should be dark slate `#020617`
   - Visit `/venue/[venueId]` — colors should be cool cyan accents, text light
   - Visit `/trivia/live` — should already look correct (canonical example)
4. **Verify font loading:** Open DevTools → Network tab, search for "googleapis". Should see Bree Serif + Nunito loading (no Kalam).
5. **Verify no legacy colors:** Search codebase for `#f7ede0`, `#fff9f0`, `#3b2412` — should return 0 results. If found, those components will be updated in Phase 2.

---

## WHAT HAPPENS NEXT (Phases 2–4)

Once Phase 1 is merged, the codebase will have the **foundation** in place but components won't visually update yet. They'll still reference old class names and inline styles. That's OK.

### Phase 2: Component styles & semantic markup
- Update all `.tp-*` class names to `.ht-*`
- Replace hardcoded hex colors with CSS custom properties
- Update button, card, input, badge styles to match design system
- Reskin Bingo and Leaderboard to use cool-ice aesthetic

### Phase 3: Page-level layouts & spacing
- Update every page (`/join`, `/venue`, `/trivia`, `/bingo`, `/pickem`, `/fantasy`, `/leaderboard`, `/activity`) to use new spacing scale
- Apply game-specific gradients and accents to game landing/live screens
- Update hamburger drawer, notifications, bottom nav to new design

### Phase 4: Polish & theme transition
- Remove all `.tp-comic-card`, `.tp-hud-card` references
- Delete legacy Kalam font from admin console (if used)
- Verify all ad placements, modals, and overlays match dark broadcast aesthetic
- Full QA pass on mobile / tablet / desktop

---

## KEY PRINCIPLES TO REMEMBER

1. **Dark is default.** No light mode. No legacy cream backgrounds. Ever.
2. **Accent = location.** Cyan = home. Amber = leaderboard. Each game has its own gradient.
3. **Borders are subtle.** `rgba(255,255,255,0.08)` is the hairline; never go darker unless it's an accent.
4. **Text is light.** `#f8fafc` primary, `#e2e8f0` secondary. Never go below `#94a3b8` for body text.
5. **Shadows are soft.** `0 8px 24px rgba(0,0,0,0.40)` is the card shadow. No hard offsets.
6. **Exit pill is warm.** The gradient `#a93d3a → #c8573e → #e9784e` is the ONLY warm element on screen. Guard it zealously.
7. **Fonts: Bree + Nunito.** No Kalam on player surfaces. Bree for titles, Nunito for UI.

---

## INTELLIGENCE LEVEL GUIDANCE

This prompt targets **HIGH** complexity. You should:
- Understand CSS custom properties and how they cascade
- Recognize that Tailwind's theme extension works with both Tailwind utilities and CSS vars
- Know the difference between `extend` (adds to theme) and overriding the theme object
- Be comfortable with atomic design patterns and utility-first CSS

If you get stuck, refer back to `/design-system/project/colors_and_type.css` — it's the source of truth.

