# Advertising Quick Reference

Quick visual guide to the 6 ad slots in "The Local Edge" application.

---

## 📍 Ad Slot Overview

```
┌─────────────────────────────────────────────────────────┐
│                      THE LOCAL EDGE                      │
├─────────────────────────────────────────────────────────┤
│ ╔═════════════════════════════════════════════════════╗ │
│ ║  AD SLOT 1: HEADER BANNER (728x90 / 320x50)        ║ │ ← All Pages
│ ╚═════════════════════════════════════════════════════╝ │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  [Main Content: Trivia / Predictions / Activity]         │
│                                                           │
│  ┌─────────────────────────────┐  ┌──────────────────┐  │
│  │                             │  │  ╔═════════════╗  │  │
│  │  Primary Content Area       │  │  ║ AD SLOT 3:  ║  │  │ ← Desktop Only
│  │                             │  │  ║   SIDEBAR   ║  │  │   (Predictions,
│  │  ╔═══════════════════════╗  │  │  ║  (300x600)  ║  │  │    Activity)
│  │  ║ AD SLOT 2: INLINE     ║  │  │  ╚═════════════╝  │  │
│  │  ║   (300x250)           ║  │  │                  │  │
│  │  ╚═══════════════════════╝  │  └──────────────────┘  │
│  │                             │                          │
│  │  [More Content...]          │                          │
│  │                             │                          │
│  │  ╔═══════════════════════╗  │                          │
│  │  ║ AD SLOT 4: MID-CONTENT║  │                          │
│  │  ║ (728x90 / 300x250)    ║  │                          │
│  │  ╚═══════════════════════╝  │  ┌──────────────────┐  │
│  │                             │  │  ╔═════════════╗  │  │
│  │  [Leaderboard Content]      │  │  ║ AD SLOT 5:  ║  │  │ ← Leaderboard
│  │                             │  │  ║ LEADERBOARD ║  │  │   Page Only
│  └─────────────────────────────┘  │  ║  (300x250)  ║  │  │
│                                    │  ╚═════════════╝  │  │
│                                    └──────────────────┘  │
├─────────────────────────────────────────────────────────┤
│ ╔═════════════════════════════════════════════════════╗ │
│ ║  AD SLOT 6: FOOTER BANNER (728x90 / 320x50)        ║ │ ← All Pages
│ ╚═════════════════════════════════════════════════════╝ │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Slot Details

| Slot | Location | Size (Desktop) | Size (Mobile) | Pages | Priority |
|------|----------|----------------|---------------|-------|----------|
| **1** | Header | 728x90 | 320x50 | All | High |
| **2** | Inline | 300x250 | 300x250 | Trivia, Predictions | High |
| **3** | Sidebar | 300x600 | Hidden | Predictions, Activity | Medium |
| **4** | Mid-Content | 728x90 | 300x250 | Activity, Predictions | Medium |
| **5** | Leaderboard | 300x250 | 300x250 | Leaderboard | Medium |
| **6** | Footer | 728x90 | 320x50 | All | Low |

---

## 📱 Mobile vs Desktop

### Desktop View (≥1024px)
- All 6 ad slots visible
- Sidebar ads (Slot 3) shown
- Larger banner sizes (728x90)

### Mobile View (<1024px)
- 5 ad slots visible (Slot 3 hidden)
- Smaller banner sizes (320x50)
- Inline ads maintain 300x250

---

## 💾 Database Schema

```sql
CREATE TABLE advertisements (
  id UUID PRIMARY KEY,
  slot TEXT CHECK (slot IN ('header', 'inline-content', 'sidebar', 'mid-content', 'leaderboard-sidebar', 'footer')),
  venue_id TEXT REFERENCES venues(id),  -- Optional: target specific venue
  advertiser_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  click_url TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔧 Component Usage

### Basic Implementation

```tsx
import AdBanner from '@/components/AdBanner';

// In layout.tsx (header)
<AdBanner slot="header" className="max-w-screen-lg mx-auto" />

// In layout.tsx (footer)
<AdBanner slot="footer" className="max-w-screen-lg mx-auto" />

// In trivia page (inline)
<AdBanner slot="inline-content" venueId={currentVenueId} />

// In predictions page (sidebar)
<aside className="hidden lg:block">
  <AdBanner slot="sidebar" />
</aside>

// In leaderboard page
<AdBanner slot="leaderboard-sidebar" />
```

---

## 📊 Tracking

### Automatic Tracking
- **Impressions**: Tracked when ad is displayed
- **Clicks**: Tracked when user clicks ad
- **CTR**: Calculated as (clicks / impressions) × 100

### API Endpoints
```
GET  /api/ads?slot=header&venueId=VENUE_123
POST /api/ads/impression { adId: "uuid" }
POST /api/ads/click { adId: "uuid" }
```

---

## 🎨 Styling

### Ad Container Classes
```css
.ad-banner {
  @apply relative rounded-lg overflow-hidden;
  @apply border border-gray-200;
  @apply transition-shadow hover:shadow-md;
}

.ad-banner img {
  @apply w-full h-auto object-cover;
}

.ad-banner .ad-label {
  @apply absolute top-1 right-1;
  @apply bg-black/50 text-white text-xs px-2 py-0.5 rounded;
}
```

---

## 💰 Pricing Models

### CPM (Cost Per Mille)
- Header/Footer: $5-10 per 1,000 impressions
- Sidebar: $3-7 per 1,000 impressions
- Inline: $4-8 per 1,000 impressions

### CPC (Cost Per Click)
- All slots: $0.50-2.00 per click

### Flat Rate
- Premium slots: $500-1,500/month
- Standard slots: $200-800/month

---

## ✅ Implementation Checklist

- [ ] Add Advertisement types to `/types/index.ts`
- [ ] Create advertisements table in Supabase
- [ ] Implement `/components/AdBanner.tsx`
- [ ] Create `/lib/ads.ts` for ad utilities
- [ ] Build `/app/api/ads/route.ts`
- [ ] Build `/app/api/ads/impression/route.ts`
- [ ] Build `/app/api/ads/click/route.ts`
- [ ] Update `/app/layout.tsx` with header/footer ads
- [ ] Add inline ads to `/app/trivia/page.tsx`
- [ ] Add sidebar ads to `/app/predictions/page.tsx`
- [ ] Add sidebar ad to `/app/leaderboard/page.tsx`
- [ ] Create `/app/admin/ads/page.tsx`
- [ ] Build `/app/api/admin/ads/route.ts`
- [ ] Test on mobile and desktop
- [ ] Verify impression tracking
- [ ] Verify click tracking
- [ ] Test with multiple advertisers
- [ ] Verify venue-specific targeting
- [ ] Check accessibility compliance

---

## 🔗 Related Documentation

- **[ADVERTISING_GUIDE.md](./ADVERTISING_GUIDE.md)** - Complete implementation guide with code examples
- **[IMPLEMENTATION_PHASES.md](./IMPLEMENTATION_PHASES.md)** - Updated phases including advertising
- **[SUMMARY.md](./SUMMARY.md)** - Executive summary of all changes

---

**Ready to implement!** 🚀
