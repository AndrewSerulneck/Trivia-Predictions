import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AdSlot, Advertisement } from "@/types";

type AdEventType = "impression" | "click";

type AdvertisementRow = {
  id: string;
  slot: AdSlot;
  venue_id: string | null;
  advertiser_name: string;
  image_url: string;
  click_url: string;
  alt_text: string;
  width: number;
  height: number;
  active: boolean;
  start_date: string;
  end_date: string | null;
  impressions: number;
  clicks: number;
};

function mapAdRow(row: AdvertisementRow): Advertisement {
  return {
    id: row.id,
    slot: row.slot,
    venueId: row.venue_id ?? undefined,
    advertiserName: row.advertiser_name,
    imageUrl: row.image_url,
    clickUrl: row.click_url,
    altText: row.alt_text,
    width: row.width,
    height: row.height,
    active: row.active,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    impressions: row.impressions,
    clicks: row.clicks,
  };
}

async function getActiveAdQuery(slot: AdSlot, venueId?: string): Promise<Advertisement | null> {
  if (!supabaseAdmin) {
    return null;
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("advertisements")
    .select(
      "id, slot, venue_id, advertiser_name, image_url, click_url, alt_text, width, height, active, start_date, end_date, impressions, clicks"
    )
    .eq("slot", slot)
    .eq("active", true)
    .lte("start_date", nowIso)
    .or(`end_date.is.null,end_date.gte.${nowIso}`)
    .match(venueId ? { venue_id: venueId } : { venue_id: null })
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle<AdvertisementRow>();

  if (error || !data) {
    return null;
  }

  return mapAdRow(data);
}

export async function getActiveAdForSlot(slot: AdSlot, venueId?: string): Promise<Advertisement | null> {
  if (venueId) {
    const venueAd = await getActiveAdQuery(slot, venueId);
    if (venueAd) {
      return venueAd;
    }
  }

  return getActiveAdQuery(slot);
}

export async function getAdById(id: string): Promise<Advertisement | null> {
  if (!supabaseAdmin || !id) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("advertisements")
    .select(
      "id, slot, venue_id, advertiser_name, image_url, click_url, alt_text, width, height, active, start_date, end_date, impressions, clicks"
    )
    .eq("id", id)
    .maybeSingle<AdvertisementRow>();

  if (error || !data) {
    return null;
  }

  return mapAdRow(data);
}

async function incrementCounter(id: string, field: "impressions" | "clicks"): Promise<void> {
  if (!supabaseAdmin || !id) {
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("advertisements")
    .select(field)
    .eq("id", id)
    .maybeSingle<{ impressions?: number; clicks?: number }>();

  if (error || !data) {
    return;
  }

  const currentValue = Number(data[field] ?? 0);
  await supabaseAdmin
    .from("advertisements")
    .update({ [field]: currentValue + 1 })
    .eq("id", id);
}

async function insertAdEvent(id: string, eventType: AdEventType): Promise<void> {
  if (!supabaseAdmin || !id) {
    return;
  }

  const { error } = await supabaseAdmin.from("ad_events").insert({
    ad_id: id,
    event_type: eventType,
  });

  if (error) {
    // Ignore event-table errors so tracking never breaks the main request flow.
    return;
  }
}

export async function recordAdImpression(id: string): Promise<void> {
  await Promise.all([incrementCounter(id, "impressions"), insertAdEvent(id, "impression")]);
}

export async function recordAdClick(id: string): Promise<void> {
  await Promise.all([incrementCounter(id, "clicks"), insertAdEvent(id, "click")]);
}
