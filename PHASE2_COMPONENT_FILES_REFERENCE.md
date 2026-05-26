# Phase 2 Component Files Reference

## Layer A: UI Primitives (~15 files)

**Location:** `/components/ui/`

### Foundation (buttons, cards, containers)
- `PageShell.tsx` — Page wrapper with padding/background
- `AppShell.tsx` — App-wide container
- `BouncingBallLoader.tsx` — Loading indicator
- `HightopLogo.tsx` — Logo component

### Navigation
- `LeftHamburgerMenu.tsx` — Hamburger drawer menu
- `LeftHamburgerNav.tsx` — Hamburger navigation (related)
- `MobileBottomNav.tsx` — Bottom navigation bar
- `NotificationBell.tsx` — Notifications dropdown

### Ads & other
- `AdBanner.tsx` — Banner ad component
- `SlotAd.tsx` — Slot ad container
- `PopupAds.tsx` — Popup ad overlay
- `MobileAdhesionAd.tsx` — Adhesion ad
- `GlobalTransitionOverlay.tsx` — Loading overlay
- `RouteLoadingScreen.tsx` — Route loading indicator

---

## Layer B: Game-Specific Cards (~15 files)

**Locations:** `/components/trivia/`, `/components/bingo/`, `/components/pickem/`, `/components/fantasy/`

### Trivia
- `/components/trivia/TriviaGame.tsx` — Live trivia game board
- `/components/trivia/TriviaAppFrame.tsx` — Trivia screen frame
- `/components/trivia/ReadyPrompt.tsx` — Ready screen before game

### Bingo
- `/components/bingo/BingoThemeScope.tsx` — Bingo theme wrapper
- `/components/bingo/ActionPop.tsx` — Square animation on mark
- `/components/bingo/SportsBingoHome.tsx` — Bingo home screen
- `/components/bingo/SportsBingoSelectSport.tsx` — Sport selector

### Pick 'Em
- `/components/pickem/PickEmGameList.tsx` — Game list (with inline ads)
- `/components/pickem/PickEmSportSelect.tsx` — Sport selector
- `/components/pickem/PointsBank.tsx` — Points display
- `/components/pickem/PickEmRecentPicks.tsx` — Recent picks history

### Fantasy
- `/components/fantasy/FantasyHome.tsx` — Fantasy home page
- `/components/fantasy/PointsLedger.tsx` — Scoring ledger

---

## Layer C: Layout Shells & Containers (~10 files)

**Locations:** `/components/venue/`, `/components/activity/`, `/components/challenges/`

- `/components/venue/GameLandingExperience.tsx` — Game landing page (rules, start button)
- `/components/venue/VenueHubClient.tsx` — Venue home (games, leaderboard, challenges tabs)
- `/components/venue/GameIdentityPanel.tsx` — Game header with gradient
- `/components/venue/VenueEntryRulesPanel.tsx` — Rules card
- `/components/activity/ActiveGamesPanel.tsx` — Active games container
- `/components/activity/ActivityTimeline.tsx` — Activity history timeline
- `/components/challenges/PendingChallengesPanel.tsx` — Challenges list
- `/components/challenges/ChallengeRedeemPanel.tsx` — Challenge redemption

---

## Layer D: Data Visualization (~8 files)

**Locations:** `/components/leaderboard/`, `/components/activity/`

- `/components/leaderboard/LeaderboardTable.tsx` — Main leaderboard table (amber accents)
- `/components/activity/ActivityTimeline.tsx` — Activity list (blue accents)
- `/components/activity/CareerStatsPanel.tsx` — Career stats display (blue accents)
- `/components/fantasy/PointsLedger.tsx` — Scoring table (game-colored accents)
- `/components/prizes/PrizeWalletPanel.tsx` — Prize wallet (gold accents)

---

## Layer E: Forms & Joins (~10 files)

**Locations:** `/components/join/`, `/components/admin/`, `/components/predictions/`

- `/components/join/JoinFlow.tsx` — Join/login flow (PIN entry, venue selection)
- `/components/admin/sections/adFormShared.tsx` — Ad creation form
- `/components/ads/AdvertisingIntakeForm.tsx` — Advertiser intake form
- `/components/predictions/PredictionMarketList.tsx` — Prediction input list
- `/components/predictions/BackToVenueButton.tsx` — Navigation button

---

## Color Mapping Quick Reference

### Surface Colors
```
#020617 → var(--ht-canvas)
#0f172a → var(--ht-surface)
#1e293b → var(--ht-elevated)
#334155 → var(--ht-elevated-2)
```

### Text Colors
```
#f8fafc → var(--ht-fg-primary)
#e2e8f0 → var(--ht-fg-secondary)
#94a3b8 → var(--ht-fg-muted)
#64748b → var(--ht-fg-dim)
```

### Border Colors
```
rgba(255,255,255,0.08) → var(--ht-border-hairline)
rgba(255,255,255,0.12) → var(--ht-border-soft)
rgba(255,255,255,0.20) → var(--ht-border-strong)
```

### Game Gradients (use these in game-specific components)
```
Live Trivia:   var(--ht-game-live)      + border: var(--ht-game-live-edge)
Speed Trivia:  var(--ht-game-trivia)    + border: var(--ht-game-trivia-edge)
Bingo:         var(--ht-game-bingo)     + border: var(--ht-game-bingo-edge) [COOL ICE, not warm]
Pick 'Em:      var(--ht-game-pickem)    + border: var(--ht-game-pickem-edge)
Fantasy:       var(--ht-game-fantasy)   + border: var(--ht-game-fantasy-edge)
```

### Page Accents (use these in page shells)
```
Home/Join:     var(--ht-page-home)        = cyan
Leaderboard:   var(--ht-page-leaderboard) = amber
Activity:      var(--ht-page-activity)    = blue
Prizes:        var(--ht-page-prizes)      = gold
FAQs:          var(--ht-page-faqs)        = slate
```

### Accent Color Palettes (for individual elements)
```
Cyan:      var(--ht-cyan-50)   var(--ht-cyan-200)   var(--ht-cyan-400)   var(--ht-cyan-500)
Emerald:   var(--ht-emerald-200)   var(--ht-emerald-400)   var(--ht-emerald-500)
Amber:     var(--ht-amber-200)   var(--ht-amber-400)   var(--ht-amber-500)
Rose:      var(--ht-rose-400)   var(--ht-rose-500)
Fuchsia:   var(--ht-fuchsia-400)   var(--ht-fuchsia-500)
```

### Shadows
```
Box shadow (card):   var(--ht-shadow-card)
Box shadow (modal):  var(--ht-shadow-modal)
Glow (cyan):         var(--ht-shadow-glow-cyan)
```

### Radii
```
rounded-ht-sm   = 8px
rounded-ht-md   = 12px
rounded-ht-lg   = 16px   [most common]
rounded-ht-xl   = 20px
rounded-ht-2xl  = 24px   [cards, large elements]
rounded-ht-pill = 9999px [buttons, badges]
```

---

## Semantic Type Classes

Use these `.ht-*` classes for text hierarchy:

```
.ht-display   — Hero/game title (big, with text-shadow)
.ht-h1        — Section title (Bree Serif, 36px)
.ht-h2        — Card title (Bree Serif, 30px)
.ht-question  — Big question text (Nunito 800, 36px)
.ht-body      — Default paragraph (Nunito 600, 16px)
.ht-caption   — Small text (Nunito 600, 14px)
.ht-eyebrow   — All-caps label (Nunito 900, 12px, tracked)
.ht-tabular   — Numbers that don't jitter (tabular-nums)
```

---

## Tailwind Utilities Now Available

After Phase 1, these Tailwind utilities are available in Phase 2:

```
Colors:      bg-ht-surface, text-ht-primary, border-ht-hairline, etc.
Shadows:     shadow-ht-card, shadow-ht-modal, shadow-ht-glow-cyan
Radii:       rounded-ht-sm, rounded-ht-lg, rounded-ht-pill
Animations:  animate-ht-pulse, animate-tp-glow-pulse
```

Example usage:
```typescript
<div className="bg-ht-surface border border-ht-hairline rounded-ht-lg p-4 text-ht-primary shadow-ht-card">
  {children}
</div>
```

---

## Example Component Transformations

### Before (Legacy)
```typescript
<div className="p-4 bg-slate-900 border border-slate-600 rounded-lg text-slate-50">
  <p style={{ color: "#f8fafc", marginBottom: "12px" }}>
    {title}
  </p>
  <button
    className="px-4 py-2 bg-slate-800 text-slate-50 rounded hover:bg-slate-700"
    style={{ boxShadow: "0 8px 24px rgba(0, 0, 0, 0.40)" }}
  >
    Action
  </button>
</div>
```

### After (Phase 2)
```typescript
<div className="p-4 bg-ht-surface border border-ht-soft rounded-ht-lg text-ht-primary">
  <p className="ht-body mb-3">
    {title}
  </p>
  <button
    className="px-4 py-2 bg-ht-elevated text-ht-primary rounded-ht-md hover:opacity-90 transition-opacity"
    style={{ boxShadow: "var(--ht-shadow-card)" }}
  >
    Action
  </button>
</div>
```

**Changes:**
- `bg-slate-900` → `bg-ht-surface`
- `border-slate-600` → `border-ht-soft`
- `rounded-lg` → `rounded-ht-lg`
- `text-slate-50` → `text-ht-primary`
- Hardcoded `#f8fafc` → `ht-body` class (includes color)
- `bg-slate-800` → `bg-ht-elevated`
- `hover:bg-slate-700` → `hover:opacity-90` (state change via opacity, not color)
- `boxShadow: "..."` → `boxShadow: "var(--ht-shadow-card)"`

