# Advertising Implementation Guide

This document outlines the implementation of 6 designated advertising spaces throughout "The Local Edge" application.

---

## 📍 Ad Placement Strategy

### Overview
The application supports **6 designated ad slots** strategically placed throughout the user experience to maximize visibility while maintaining a clean, non-intrusive design.

### Ad Slot Locations

```
┌─────────────────────────────────────────────┐
│  Header                                     │
│  ┌───────────────────────────────────────┐ │
│  │ Ad Slot 1: Header Banner (728x90)     │ │  ← Top banner
│  └───────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│  Main Content Area                          │
│                                             │
│  [Trivia/Predictions/Activity Content]     │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ Ad Slot 2: Content Inline (300x250)   │ │  ← Between content
│  └───────────────────────────────────────┘ │
│                                             │
│  Sidebar (desktop only)                    │
│  ┌────────────────────┐                    │
│  │ Ad Slot 3:         │                    │  ← Right sidebar
│  │ Sidebar Banner     │                    │
│  │ (300x600)          │                    │
│  └────────────────────┘                    │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ Ad Slot 4: Mid-Content (728x90)       │ │  ← Between sections
│  └───────────────────────────────────────┘ │
│                                             │
│  ┌────────────────────┐                    │
│  │ Ad Slot 5:         │                    │  ← Bottom sidebar
│  │ Leaderboard Ad     │                    │
│  │ (300x250)          │                    │
│  └────────────────────┘                    │
├─────────────────────────────────────────────┤
│  Footer                                     │
│  ┌───────────────────────────────────────┐ │
│  │ Ad Slot 6: Footer Banner (728x90)     │ │  ← Bottom banner
│  └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 🎯 Ad Slot Specifications

### Ad Slot 1: Header Banner
- **Location:** Top of every page
- **Size:** 728x90 (Leaderboard) on desktop, 320x50 (Mobile banner) on mobile
- **Visibility:** High - appears on all pages
- **Pages:** All pages (Home, Trivia, Predictions, Activity, Leaderboard)
- **Recommended:** Brand awareness, sponsored content

### Ad Slot 2: Inline Content Ad
- **Location:** Between trivia questions or prediction cards
- **Size:** 300x250 (Medium Rectangle)
- **Visibility:** Medium-High - appears in content flow
- **Pages:** Trivia page (after every 3 questions), Predictions page (after every 4 markets)
- **Recommended:** Targeted offers, local businesses

### Ad Slot 3: Sidebar Banner (Desktop)
- **Location:** Right sidebar on desktop, hidden on mobile
- **Size:** 300x600 (Half Page) or 160x600 (Wide Skyscraper)
- **Visibility:** Medium - visible throughout session
- **Pages:** Predictions, Activity pages
- **Recommended:** High-value products, premium brands

### Ad Slot 4: Mid-Content Banner
- **Location:** Between major sections of content
- **Size:** 728x90 (Leaderboard) on desktop, 300x250 on mobile
- **Visibility:** Medium - appears mid-scroll
- **Pages:** Activity feed, Long-form prediction details
- **Recommended:** Call-to-action ads, sign-ups

### Ad Slot 5: Leaderboard Sidebar Ad
- **Location:** Below leaderboard table, above fold on mobile
- **Size:** 300x250 (Medium Rectangle)
- **Visibility:** High on leaderboard page
- **Pages:** Leaderboard page only
- **Recommended:** Competitive products, gaming-related

### Ad Slot 6: Footer Banner
- **Location:** Bottom of every page, sticky on mobile
- **Size:** 728x90 (Leaderboard) on desktop, 320x50 (Mobile banner) on mobile
- **Visibility:** Low-Medium - visible when scrolling to bottom
- **Pages:** All pages
- **Recommended:** Retargeting, secondary offers

---

## 💻 Implementation

### Phase 1: Type Definitions (Add to `/types/index.ts`)

```typescript
export interface Advertisement {
  id: string;
  slot: 'header' | 'inline-content' | 'sidebar' | 'mid-content' | 'leaderboard-sidebar' | 'footer';
  venueId?: string; // Optional: target specific venues
  advertiserName: string;
  imageUrl: string;
  clickUrl: string;
  altText: string;
  width: number;
  height: number;
  active: boolean;
  startDate: string;
  endDate?: string;
  impressions: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdSlotConfig {
  slotId: 'header' | 'inline-content' | 'sidebar' | 'mid-content' | 'leaderboard-sidebar' | 'footer';
  desktopSize: { width: number; height: number };
  mobileSize: { width: number; height: number };
  pages: string[];
}
```

### Phase 2: Database Schema (Add to Supabase)

```sql
-- Advertisements table
CREATE TABLE advertisements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot TEXT NOT NULL CHECK (slot IN ('header', 'inline-content', 'sidebar', 'mid-content', 'leaderboard-sidebar', 'footer')),
  venue_id TEXT REFERENCES venues(id),
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

-- Create indexes
CREATE INDEX idx_ads_slot ON advertisements(slot);
CREATE INDEX idx_ads_venue ON advertisements(venue_id);
CREATE INDEX idx_ads_active ON advertisements(active);
CREATE INDEX idx_ads_dates ON advertisements(start_date, end_date);

-- Enable Row Level Security
ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

-- Public can view active ads
CREATE POLICY "Anyone can view active ads" ON advertisements 
  FOR SELECT USING (active = TRUE AND start_date <= NOW() AND (end_date IS NULL OR end_date >= NOW()));

-- Only admins can manage ads
CREATE POLICY "Admins can manage ads" ON advertisements 
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND is_admin = TRUE)
  );

-- Function to increment impressions
CREATE OR REPLACE FUNCTION increment_ad_impression(ad_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE advertisements 
  SET impressions = impressions + 1, updated_at = NOW()
  WHERE id = ad_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment clicks
CREATE OR REPLACE FUNCTION increment_ad_click(ad_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE advertisements 
  SET clicks = clicks + 1, updated_at = NOW()
  WHERE id = ad_id;
END;
$$ LANGUAGE plpgsql;
```

### Phase 3: Ad Banner Component (`/components/AdBanner.tsx`)

```typescript
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Advertisement } from '@/types';

interface AdBannerProps {
  slot: 'header' | 'inline-content' | 'sidebar' | 'mid-content' | 'leaderboard-sidebar' | 'footer';
  className?: string;
  venueId?: string;
}

export default function AdBanner({ slot, className = '', venueId }: AdBannerProps) {
  const [ad, setAd] = useState<Advertisement | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAd = async () => {
      try {
        const params = new URLSearchParams({ slot });
        if (venueId) params.append('venueId', venueId);
        
        const response = await fetch(`/api/ads?${params}`);
        if (response.ok) {
          const data = await response.json();
          setAd(data);
          
          // Track impression
          if (data?.id) {
            fetch(`/api/ads/impression`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ adId: data.id }),
            });
          }
        }
      } catch (error) {
        console.error('Error fetching ad:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAd();
  }, [slot, venueId]);

  const handleAdClick = async () => {
    if (ad?.id) {
      // Track click
      try {
        await fetch(`/api/ads/click`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adId: ad.id }),
        });
      } catch (error) {
        console.error('Error tracking ad click:', error);
      }
      
      // Open ad URL
      window.open(ad.clickUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (isLoading) {
    return (
      <div className={`bg-gray-100 animate-pulse rounded-lg ${className}`}>
        <div className="flex items-center justify-center h-full text-gray-400">
          <span className="text-sm">Loading ad...</span>
        </div>
      </div>
    );
  }

  if (!ad) {
    return null; // Or return a placeholder
  }

  return (
    <div className={`ad-banner ${className}`} data-slot={slot}>
      <div className="relative">
        <button
          onClick={handleAdClick}
          className="w-full focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg overflow-hidden"
          aria-label={`Advertisement: ${ad.altText}`}
        >
          <Image
            src={ad.imageUrl}
            alt={ad.altText}
            width={ad.width}
            height={ad.height}
            className="w-full h-auto"
            priority={slot === 'header'} // Prioritize header ads
          />
        </button>
        <span className="absolute top-1 right-1 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
          Ad
        </span>
      </div>
      <p className="text-xs text-gray-500 text-center mt-1">
        Sponsored by {ad.advertiserName}
      </p>
    </div>
  );
}
```

### Phase 4: Ad Slot Configuration (`/lib/ads.ts`)

```typescript
import { AdSlotConfig } from '@/types';

export const AD_SLOTS: Record<string, AdSlotConfig> = {
  header: {
    slotId: 'header',
    desktopSize: { width: 728, height: 90 },
    mobileSize: { width: 320, height: 50 },
    pages: ['/', '/trivia', '/predictions', '/activity', '/leaderboard'],
  },
  'inline-content': {
    slotId: 'inline-content',
    desktopSize: { width: 300, height: 250 },
    mobileSize: { width: 300, height: 250 },
    pages: ['/trivia', '/predictions'],
  },
  sidebar: {
    slotId: 'sidebar',
    desktopSize: { width: 300, height: 600 },
    mobileSize: { width: 0, height: 0 }, // Hidden on mobile
    pages: ['/predictions', '/activity'],
  },
  'mid-content': {
    slotId: 'mid-content',
    desktopSize: { width: 728, height: 90 },
    mobileSize: { width: 300, height: 250 },
    pages: ['/activity', '/predictions'],
  },
  'leaderboard-sidebar': {
    slotId: 'leaderboard-sidebar',
    desktopSize: { width: 300, height: 250 },
    mobileSize: { width: 300, height: 250 },
    pages: ['/leaderboard'],
  },
  footer: {
    slotId: 'footer',
    desktopSize: { width: 728, height: 90 },
    mobileSize: { width: 320, height: 50 },
    pages: ['/', '/trivia', '/predictions', '/activity', '/leaderboard'],
  },
};

export function getAdForSlot(slot: string, venueId?: string): Promise<Advertisement | null> {
  // This will be implemented in the API route
  return fetch(`/api/ads?slot=${slot}${venueId ? `&venueId=${venueId}` : ''}`)
    .then((res) => res.json())
    .catch(() => null);
}
```

### Phase 5: API Routes

#### `/app/api/ads/route.ts` - Get Ad for Slot

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const slot = searchParams.get('slot');
  const venueId = searchParams.get('venueId');

  if (!slot) {
    return NextResponse.json({ error: 'Slot parameter required' }, { status: 400 });
  }

  try {
    let query = supabase
      .from('advertisements')
      .select('*')
      .eq('slot', slot)
      .eq('active', true)
      .lte('start_date', new Date().toISOString());

    // Filter by venue or get global ads
    if (venueId) {
      query = query.or(`venue_id.eq.${venueId},venue_id.is.null`);
    } else {
      query = query.is('venue_id', null);
    }

    // Only get ads that haven't expired
    query = query.or('end_date.is.null,end_date.gte.' + new Date().toISOString());

    const { data, error } = await query.order('created_at', { ascending: false }).limit(1).single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return NextResponse.json(data || null);
  } catch (error) {
    console.error('Error fetching ad:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

#### `/app/api/ads/impression/route.ts` - Track Impression

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { adId } = await request.json();

    if (!adId) {
      return NextResponse.json({ error: 'adId required' }, { status: 400 });
    }

    const { error } = await supabase.rpc('increment_ad_impression', { ad_id: adId });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking impression:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

#### `/app/api/ads/click/route.ts` - Track Click

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { adId } = await request.json();

    if (!adId) {
      return NextResponse.json({ error: 'adId required' }, { status: 400 });
    }

    const { error } = await supabase.rpc('increment_ad_click', { ad_id: adId });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking click:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Phase 6: Update Layout (`/app/layout.tsx`)

```typescript
import AdBanner from '@/components/AdBanner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Header with Ad Slot 1 */}
        <header className="sticky top-0 z-50 bg-white shadow">
          <div className="container mx-auto px-4 py-2">
            {/* Logo, nav, etc. */}
          </div>
          <div className="border-t border-gray-200 py-2">
            <AdBanner slot="header" className="max-w-screen-lg mx-auto" />
          </div>
        </header>

        {/* Main content */}
        <main className="min-h-screen">
          {children}
        </main>

        {/* Footer with Ad Slot 6 */}
        <footer className="bg-gray-100 border-t border-gray-200">
          <div className="container mx-auto px-4 py-4">
            <AdBanner slot="footer" className="max-w-screen-lg mx-auto mb-4" />
            <div className="text-center text-sm text-gray-600">
              © 2026 The Local Edge
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
```

### Phase 7: Update Page Templates

#### Trivia Page with Inline Ads (`/app/trivia/page.tsx`)

```typescript
import AdBanner from '@/components/AdBanner';

export default function TriviaPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1>Trivia Challenge</h1>
      
      {/* Show trivia questions */}
      <TriviaQuestion number={1} />
      <TriviaQuestion number={2} />
      <TriviaQuestion number={3} />
      
      {/* Ad Slot 2: Inline Content - after every 3 questions */}
      <div className="my-8">
        <AdBanner slot="inline-content" />
      </div>
      
      <TriviaQuestion number={4} />
      {/* ... more questions */}
    </div>
  );
}
```

#### Predictions Page with Sidebar (`/app/predictions/page.tsx`)

```typescript
import AdBanner from '@/components/AdBanner';

export default function PredictionsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          <h1>Market Predictions</h1>
          <PredictionsList />
          
          {/* Ad Slot 4: Mid-Content */}
          <div className="my-8">
            <AdBanner slot="mid-content" />
          </div>
        </div>
        
        {/* Sidebar with Ad Slot 3 - Desktop only */}
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <AdBanner slot="sidebar" />
          </div>
        </aside>
      </div>
    </div>
  );
}
```

#### Leaderboard Page (`/app/leaderboard/page.tsx`)

```typescript
import AdBanner from '@/components/AdBanner';

export default function LeaderboardPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1>Venue Leaderboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <LeaderboardTable />
        </div>
        
        {/* Ad Slot 5: Leaderboard Sidebar */}
        <aside>
          <div className="sticky top-20">
            <AdBanner slot="leaderboard-sidebar" />
          </div>
        </aside>
      </div>
    </div>
  );
}
```

---

## 🔧 Admin Interface

### `/app/admin/ads/page.tsx` - Ad Management Dashboard

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Advertisement } from '@/types';

export default function AdManagementPage() {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAds();
  }, []);

  const fetchAds = async () => {
    try {
      const response = await fetch('/api/admin/ads');
      const data = await response.json();
      setAds(data);
    } catch (error) {
      console.error('Error fetching ads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Advertisement Management</h1>
      
      <div className="mb-6">
        <button className="btn btn-primary">+ Add New Advertisement</button>
      </div>

      {/* Ad list table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Slot</th>
              <th className="px-4 py-3 text-left">Advertiser</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Impressions</th>
              <th className="px-4 py-3 text-right">Clicks</th>
              <th className="px-4 py-3 text-right">CTR</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ads.map((ad) => (
              <tr key={ad.id} className="border-t">
                <td className="px-4 py-3">{ad.slot}</td>
                <td className="px-4 py-3">{ad.advertiserName}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${ad.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {ad.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{ad.impressions.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{ad.clicks.toLocaleString()}</td>
                <td className="px-4 py-3 text-right">
                  {ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : 0}%
                </td>
                <td className="px-4 py-3">
                  <button className="text-blue-600 hover:underline mr-2">Edit</button>
                  <button className="text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## 📊 Analytics & Reporting

### Key Metrics to Track

1. **Impressions**: How many times each ad was displayed
2. **Clicks**: How many times users clicked on ads
3. **CTR (Click-Through Rate)**: Clicks / Impressions × 100
4. **Revenue per Slot**: Track which slots perform best
5. **Venue Performance**: Compare ad performance across venues

### Dashboard Features

- Real-time impression and click tracking
- Daily/weekly/monthly reports
- Per-advertiser analytics
- Slot performance comparison
- Revenue projections

---

## 🎨 Design Guidelines

### Mobile-First Considerations

- Header and footer ads resize for mobile (728x90 → 320x50)
- Sidebar ads hidden on mobile viewports
- Inline ads maintain 300x250 size on mobile
- Ads marked with "Ad" label for transparency
- Non-intrusive placement between content sections

### Accessibility

- All ads have descriptive `alt` text
- Keyboard navigation support
- Focus states for clickable ads
- Screen reader friendly
- ARIA labels for ad containers

### Performance

- Lazy load ads below the fold
- Optimize images (WebP format preferred)
- Cache ad content when possible
- Asynchronous tracking calls
- Minimal JavaScript overhead

---

## 💰 Monetization Strategy

### Pricing Models

1. **CPM (Cost Per Mille)**: Price per 1,000 impressions
   - Header: $5-10 CPM
   - Sidebar: $3-7 CPM
   - Footer: $2-5 CPM

2. **CPC (Cost Per Click)**: Price per click
   - Inline: $0.50-1.50 per click
   - Leaderboard sidebar: $0.75-2.00 per click

3. **Flat Rate**: Monthly/weekly fixed pricing
   - Premium slots: $500-1,500/month
   - Standard slots: $200-800/month

### Advertiser Tiers

- **Tier 1 (Global)**: Ads shown at all venues
- **Tier 2 (Regional)**: Ads shown at specific venue group
- **Tier 3 (Venue-Specific)**: Ads only at one venue

---

## ✅ Implementation Checklist

- [ ] Add Advertisement types to `/types/index.ts`
- [ ] Create advertisements table in Supabase
- [ ] Implement AdBanner component
- [ ] Create ad slot configuration
- [ ] Build API routes (GET, impression, click tracking)
- [ ] Update layout.tsx with header/footer ads
- [ ] Add inline ads to Trivia page
- [ ] Add sidebar ads to Predictions page
- [ ] Add sidebar ad to Leaderboard page
- [ ] Build admin interface for ad management
- [ ] Set up analytics tracking
- [ ] Test responsive behavior on mobile
- [ ] Verify accessibility compliance
- [ ] Load test with multiple ads
- [ ] Document advertiser onboarding process

---

## 🔒 Privacy & Compliance

### User Privacy

- No third-party tracking cookies
- First-party impression/click tracking only
- Comply with GDPR/CCPA regulations
- Privacy policy updated to mention advertising
- User opt-out options (if required by jurisdiction)

### Ad Content Guidelines

- No malicious content
- No misleading claims
- Age-appropriate content
- Venue-appropriate themes
- Clear distinction between ads and content

---

## 🚀 Future Enhancements

- A/B testing for ad placements
- Dynamic ad rotation (multiple ads per slot)
- Video ad support
- Native advertising integration
- Real-time bidding (RTB) system
- Advanced targeting (demographics, behavior)
- Ad blockers detection and fallback
- Programmatic advertising integration

---

**Ready for implementation!** Follow this guide to add advertising support to "The Local Edge" application.
