# Story Share Visual & Copy Design Reference

**Document:** Visual and copy design specifications for the Bar Victory Story Share feature  
**Covers:** Live Trivia and Category Blitz winner story overlays  
**Updated:** 2026-07-12

---

## Table of Contents

1. [Caption Library (30 Options)](#caption-library-30-options)
2. [Visual Direction Brief](#visual-direction-brief)
3. [Design Tokens & Assets](#design-tokens--assets)
4. [Implementation Checklist](#implementation-checklist)

---

## Caption Library (30 Options)

### Funny Captions (10)

Use these for lighthearted, relatable sharing moments:

| # | Caption |
|---|---------|
| 1 | "My brain is 90% trivia and 10% remembering to close my tab" |
| 2 | "They said 'last call for answers' and I said 'hold my beer'" |
| 3 | "IQ test came back: positive for bar food" |
| 4 | "Spent $40 to win $10 and I'd do it again" |
| 5 | "My therapist says I need validation. My trivia score agrees" |
| 6 | "Currently accepting apologies from everyone who said I don't know things" |
| 7 | "Brain cells: depleted. Dignity: intact. Victory: mine." |
| 8 | "I came, I saw, I vaguely remembered" |
| 9 | "Trivia night: where my useless knowledge finally pays for nachos" |
| 10 | "They said 'teams of six' but I heard 'me against the world'" |

### Confident / Braggy Captions (10)

Use these for champion moments and top performances:

| # | Caption |
|---|---------|
| 1 | "Undisputed. Unbothered. Unstoppable." |
| 2 | "Not lucky, just inevitable." |
| 3 | "Someone's gotta set the standard" |
| 4 | "The trophy's nice, but the silence from my haters is better" |
| 5 | "Built different, proven tonight" |
| 6 | "Knew the answers before the questions finished" |
| 7 | "This isn't even my final form" |
| 8 | "Legendary status: unlocked" |
| 9 | "Second place is just first place with worse WiFi" |
| 10 | "Started from the bottom, now we're drinking from the winner's cup" |

### Polished Brand-Safe Captions (10)

Use these for broader appeal and venue partnership contexts:

| # | Caption |
|---|---------|
| 1 | "Champion at [Venue Name] — best trivia night in town" |
| 2 | "Another unforgettable night of trivia with great company" |
| 3 | "When knowledge meets good times, everyone's a winner" |
| 4 | "Proof that showing up pays off" |
| 5 | "Great questions, better people, unforgettable night" |
| 6 | "Trivia night done right at [Venue Name]" |
| 7 | "Small wins, big memories" |
| 8 | "Good food, good drinks, great trivia" |
| 9 | "The best way to spend a night out" |
| 10 | "Challenging questions, rewarding results" |

### Caption Selection Logic

```typescript
// Suggested mapping for caption presets
const captionPresets = {
  funny: [/* 10 funny captions */],
  confident: [/* 10 braggy captions */],
  polished: [/* 10 brand-safe captions */],
};

// Selection criteria
function selectCaptionVariant(payload: StorySharePayload): CaptionCategory {
  if (payload.isChampion) return 'confident';  // Champions get braggy
  if (payload.finalRank && payload.finalRank <= 3) return 'confident';  // Top 3
  if (payload.venuePartnership) return 'polished';  // Venue-forward
  return 'funny';  // Default
}
```

---

## Visual Direction Brief

### 1. Live Trivia Winner Story

#### Color Direction

| Element | Value | Usage |
|---------|-------|-------|
| **Primary Accent** | Electric Violet `#8B5CF6` | Rank badges, score highlights, champion crown |
| **Secondary Accent** | Neon Cyan `#06B6D4` | Venue name tag, dividers, subtle glows |
| **Frame Border** | Gradient: Deep Purple `#4C1D95` → Electric Violet `#8B5CF6` | Top/bottom edge framing |
| **Text Primary** | Pure White `#FFFFFF` | Headlines, scores |
| **Text Secondary** | Soft Lavender `#E9D5FF` | Subtitles, venue names |
| **Overlay Treatment** | 15-20% black gradient vignette from edges | Ensures text readability over busy backgrounds |

**Energy:** Arcade-meets-nightclub. Glowing edges, subtle pulse animation potential on champion variant.

#### Placement Zones (1080×1920 canvas)

```
┌─────────────────────────────┐  ← Safe Zone: 60px top margin
│      [BRAND WATERMARK]      │     Hightop logo, 40px height, 80% opacity
│                             │
│  ┌─────────────────────┐    │  ← Dynamic Zone: Score/Rank
│  │    🏆 1ST PLACE     │    │     Centered, 120px from top
│  │      2,450 PTS      │    │
│  └─────────────────────┘    │
│                             │
│                             │
│    [FACE SAFE ZONE]         │  ← Critical: 600×800px center area
│         😊                  │     Completely clear of text/graphics
│                             │     User's face should land here
│                             │
│                             │
│  ┌─────────────────────┐    │  ← Dynamic Zone: User/Venue
│  │   @username         │    │     400px from bottom
│  │   📍 Venue Name     │    │
│  └─────────────────────┘    │
│                             │
│    [CAPTION OPTIONAL]       │  ← 180px from bottom, max 2 lines
│                             │
│  ┌─────────────────────┐    │  ← CTA Zone: 100px from bottom
│  │   "Play at Hightop" │    │     Small, brand-safe
│  └─────────────────────┘    │
└─────────────────────────────┘  ← Safe Zone: 40px bottom (home indicator)
```

#### Typography Direction

| Element | Font Style | Size | Weight | Treatment |
|---------|-----------|------|--------|-----------|
| **Rank** | Display Sans (Inter/Geist) | 72px | Bold | Uppercase, slight letter-spacing (+2%) |
| **Score** | Monospace Numeric | 56px | Medium | Tabular nums, electric violet color |
| **Username** | Display Sans | 36px | Semibold | Leading `@` symbol in muted color |
| **Venue** | Display Sans | 28px | Regular | Location pin icon prefix, 80% opacity |
| **Caption** | Display Sans | 24px | Regular | Italic optional, max 40 chars |
| **CTA** | Display Sans | 18px | Medium | All caps, 60% opacity |

**Typography Energy:** Bold, confident, slightly oversized numbers. Think sports broadcast meets nightlife poster.

#### Safe Areas

| Zone | Dimensions | Rules |
|------|-----------|-------|
| **Face Safe Zone** | 600×800px centered | Absolutely no text, graphics, or heavy overlays |
| **Top Margin** | 60px | Status bar clearance + brand watermark |
| **Bottom Margin** | 100px | Home indicator + CTA safe zone |
| **Side Margins** | 60px each | Ensure text doesn't bleed to edges on curved screens |
| **Caption Max Width** | 800px centered | Prevent text running too wide |

#### Champion vs Standard Variant Differences

| Element | Standard | Champion |
|---------|----------|----------|
| **Frame Border** | 8px solid gradient | 12px animated gradient + subtle glow |
| **Rank Badge** | Simple circle, rank number | Crown icon overlay, gold accent `#F59E0B` |
| **Background Effect** | Static vignette | Subtle animated particles (bokeh dots) |
| **Score Treatment** | Standard electric violet | Pulsing glow, larger size (+20%) |
| **Accent Colors** | Violet + Cyan | Violet + Cyan + Gold champion highlights |
| **"CHAMPION" Text** | Not shown | Banner across top 100px, gold text |
| **Confetti** | None | Subtle edge confetti treatment (static PNG) |

---

### 2. Category Blitz Winner Story

#### Color Direction

| Element | Value | Usage |
|---------|-------|-------|
| **Primary Accent** | Hot Magenta `#EC4899` | Rank badges, timer highlights |
| **Secondary Accent** | Electric Lime `#84CC16` | Category icons, speed bonuses |
| **Frame Border** | Gradient: Deep Magenta `#BE185D` → Hot Pink `#F472B6` | Dynamic angle (diagonal sweep) |
| **Text Primary** | Pure White `#FFFFFF` | Headlines, scores |
| **Text Secondary** | Soft Pink `#FCE7F3` | Subtitles, category names |
| **Overlay Treatment** | Radial gradient from center (transparent) to edges (15% black) | Keeps face clear, frames edges |

**Energy:** Fast-paced, speed-focused, arcade racing game aesthetic. More kinetic than Live Trivia.

#### Placement Zones (1080×1920 canvas)

```
┌─────────────────────────────┐  ← Safe Zone: 60px top margin
│  ┌─────────────────────┐    │
│  │  ⚡ CATEGORY BLITZ  │    │  ← Game mode badge, top left
│  └─────────────────────┘    │
│                             │
│    [FACE SAFE ZONE]         │  ← Critical: 600×800px center area
│         😊                  │     Slightly higher than Live Trivia
│                             │     (face tends higher in selfies)
│                             │
│                             │
│  ┌─────────────────────┐    │  ← Dynamic Zone: Rank/Score
│  │     1ST PLACE       │    │     500px from bottom
│  │   2,450 PTS         │    │
│  │   ⏱️ 45s avg        │    │  ← Speed bonus (unique to Blitz)
│  └─────────────────────┘    │
│                             │
│  ┌─────────────────────┐    │  ← Category badge
│  │  🎯 HISTORY         │    │     320px from bottom
│  └─────────────────────┘    │
│                             │
│    [CAPTION OPTIONAL]       │  ← 200px from bottom
│                             │
│  ┌─────────────────────┐    │  ← User/Venue tag
│  │  @username • Venue  │    │     120px from bottom
│  └─────────────────────┘    │
└─────────────────────────────┘  ← Safe Zone: 40px bottom
```

#### Typography Direction

| Element | Font Style | Size | Weight | Treatment |
|---------|-----------|------|--------|-----------|
| **Game Mode** | Display Sans | 20px | Bold | Uppercase, tracking +20%, pill background |
| **Rank** | Display Sans (Italic) | 64px | Bold | Italic for speed feel, uppercase |
| **Score** | Monospace Numeric | 48px | Medium | Magenta color, tabular nums |
| **Speed Bonus** | Monospace Numeric | 32px | Regular | Clock icon prefix, lime color |
| **Category** | Display Sans | 28px | Semibold | Category emoji + name, pill badge |
| **Username/Venue** | Display Sans | 24px | Regular | Bullet separator, 80% opacity |
| **Caption** | Display Sans | 22px | Regular | Max 35 chars (shorter for speed aesthetic) |

**Typography Energy:** Italicized rank for motion feel. Monospace numbers reinforce "timer/score" arcade aesthetic.

#### Safe Areas

| Zone | Dimensions | Rules |
|------|-----------|-------|
| **Face Safe Zone** | 600×700px centered, slightly upper-biased | Selfies tend to frame face higher; accommodate this |
| **Top Margin** | 60px | Game mode badge sits here |
| **Bottom Margin** | 100px | User/venue tag + clearance |
| **Side Margins** | 50px each | Slightly tighter for speed aesthetic |
| **Speed Readout** | Keep above 400px from bottom | Don't crowd face zone |

#### Champion vs Standard Variant Differences

| Element | Standard | Champion |
|---------|----------|----------|
| **Frame Border** | 6px diagonal gradient | 10px animated diagonal sweep + motion blur hint |
| **Rank Treatment** | Italic text | Italic text + lightning bolt accent |
| **Speed Bonus** | Standard lime | Glowing lime, "SPEED DEMON" tag if <30s avg |
| **Category Badge** | Standard pill | Crowned pill, gold border |
| **Background** | Static radial gradient | Animated "speed lines" radiating from center (subtle) |
| **Accent Colors** | Magenta + Lime | Magenta + Lime + Gold `#F59E0B` champion accents |
| **Confetti** | None | Motion-blur streak particles (suggesting speed) |

---

## Design Tokens & Assets

### Shared Design System

| Element | Specification |
|---------|--------------|
| **Canvas Size** | 1080×1920px (9:16 Instagram Stories) |
| **Export Format** | PNG-24 with transparency for frame overlay |
| **Brand Logo** | Hightop wordmark, 40px height, top center, 70% opacity |
| **Minimum Text Size** | 18px (anything smaller becomes illegible in story thumbnail) |
| **Maximum Text Lines** | 2 lines for captions, 1 line for everything else |

### CSS Color Tokens

```css
/* Story Share Design Tokens */
:root {
  /* Live Trivia */
  --story-live-primary: #8B5CF6;
  --story-live-secondary: #06B6D4;
  --story-live-gradient-start: #4C1D95;
  --story-live-gradient-end: #8B5CF6;
  --story-live-text-secondary: #E9D5FF;
  
  /* Category Blitz */
  --story-blitz-primary: #EC4899;
  --story-blitz-secondary: #84CC16;
  --story-blitz-gradient-start: #BE185D;
  --story-blitz-gradient-end: #F472B6;
  --story-blitz-text-secondary: #FCE7F3;
  
  /* Champion (shared) */
  --story-champion-gold: #F59E0B;
  --story-champion-accent: #FCD34D;
  
  /* Universal */
  --story-text-primary: #FFFFFF;
  --story-text-muted: rgba(255, 255, 255, 0.8);
  --story-overlay-vignette: rgba(0, 0, 0, 0.2);
  --story-text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
}
```

### Typography Tokens

```css
:root {
  /* Font Families */
  --story-font-display: 'Inter', 'Geist', system-ui, sans-serif;
  --story-font-mono: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
  
  /* Font Sizes */
  --story-text-rank: 72px;
  --story-text-rank-champion: 86px;
  --story-text-score: 56px;
  --story-text-username: 36px;
  --story-text-venue: 28px;
  --story-text-category: 28px;
  --story-text-caption: 24px;
  --story-text-cta: 18px;
  --story-text-badge: 20px;
  
  /* Font Weights */
  --story-weight-regular: 400;
  --story-weight-medium: 500;
  --story-weight-semibold: 600;
  --story-weight-bold: 700;
  
  /* Letter Spacing */
  --story-tracking-headline: 0.02em;
  --story-tracking-badge: 0.2em;
}
```

### Required Assets

#### Frame Overlays (PNG with transparency)
| File | Description |
|------|-------------|
| `live-trivia-default.png` | Standard Live Trivia frame |
| `live-trivia-champion.png` | Champion Live Trivia frame with gold accents |
| `category-blitz-default.png` | Standard Category Blitz frame |
| `category-blitz-champion.png` | Champion Category Blitz frame |

#### Icons (SVG, white, 24×24px)
| Icon | Usage |
|------|-------|
| Crown | Champion indicator |
| Location Pin | Venue marker |
| Lightning Bolt | Category Blitz speed accent |
| Trophy | Generic winner fallback |
| Clock | Speed/time indicator |
| Target/Arrow | Category indicator |

### Accessibility Requirements

- All text must have 4.5:1 contrast ratio against typical bar lighting backgrounds
- Text stroke/shadow: 2px black at 40% opacity for readability over busy selfies
- Avoid pure black backgrounds (harsh); use deep purples/magentas instead

### Animation Notes (Future Implementation)

| Variant | Animation Treatment |
|---------|-------------------|
| **Standard** | Static frame, no animation |
| **Champion** | Subtle 2-second loop: glow pulse on rank, particle drift |

---

## Implementation Checklist

### Copy Integration
- [ ] Create `lib/socialShare/copyPresets.ts` with caption arrays
- [ ] Implement caption selection logic based on payload
- [ ] Support dynamic venue name insertion: `[Venue Name]`
- [ ] Allow user caption editing (optional)

### Visual Integration
- [ ] Create frame overlay assets (4 PNG files)
- [ ] Add CSS custom properties to `app/globals.css`
- [ ] Implement canvas rendering with text positioning
- [ ] Add safe area calculations for face detection hint

### Canvas Text Rendering Specs

```typescript
// Reference for canvas text rendering
interface CanvasTextSpec {
  // Live Trivia - Rank
  rank: {
    font: '700 72px Inter, sans-serif',
    color: '#FFFFFF',
    shadow: '0 2px 4px rgba(0,0,0,0.4)',
    y: 120 + 72, // zone + fontSize
  },
  // Live Trivia - Score
  score: {
    font: '500 56px SF Mono, monospace',
    color: '#8B5CF6',
    y: 120 + 72 + 64, // below rank
  },
  // Category Blitz - Speed (unique field)
  speedBonus: {
    font: '400 32px SF Mono, monospace',
    color: '#84CC16',
    showIf: (payload) => payload.avgResponseTime !== undefined,
  },
}
```

### Asset Directory Structure

```
public/
└── story-frames/
    ├── live-trivia/
    │   ├── default.png
    │   └── champion.png
    └── category-blitz/
        ├── default.png
        └── champion.png
```

---

## Quick Reference

### Caption Length Limits
- **Max characters:** 60 (for mobile story readability)
- **Recommended:** 40-50 characters
- **Line breaks:** Max 2 lines

### Color Quick Pick
| Context | Color | Hex |
|---------|-------|-----|
| Live Trivia accent | Electric Violet | `#8B5CF6` |
| Category Blitz accent | Hot Magenta | `#EC4899` |
| Champion gold | Amber | `#F59E0B` |
| Speed/Lime | Lime Green | `#84CC16` |
| Cyan accent | Cyan | `#06B6D4` |

### Frame Asset URLs (for implementation)
```typescript
const FRAME_ASSETS = {
  'live-trivia': {
    default: '/story-frames/live-trivia/default.png',
    champion: '/story-frames/live-trivia/champion.png',
  },
  'category-blitz': {
    default: '/story-frames/category-blitz/default.png',
    champion: '/story-frames/category-blitz/champion.png',
  },
} as const;
```

---

*This document is a living reference. Update as implementation details evolve.*
