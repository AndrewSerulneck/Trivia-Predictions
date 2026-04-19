import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeAdPlacementMeta, type AdPlacementMeta } from "@/lib/adPlacements";
import type { AdDisplayTrigger, AdPageKey, AdSlot, AdType, Advertisement } from "@/types";

type AdEventType = "impression" | "click";
type AdEventContext = {
  pageKey?: AdPageKey;
  venueId?: string;
};

type AdvertisementRow = {
  id: string;
  slot: AdSlot;
  page_key: AdPageKey | null;
  ad_type: AdType | null;
  display_trigger: AdDisplayTrigger | null;
  placement_key: string | null;
  round_number: number | null;
  sequence_index: number | null;
  venue_id: string | null;
  venue_ids: string[] | null;
  advertiser_name: string;
  delivery_weight: number | null;
  image_url: string;
  click_url: string;
  alt_text: string;
  width: number;
  height: number;
  dismiss_delay_seconds: number | null;
  popup_cooldown_seconds: number | null;
  active: boolean;
  start_date: string;
  end_date: string | null;
  impressions: number;
  clicks: number;
};

function mapAdRow(row: AdvertisementRow): Advertisement {
  const placementMeta = normalizeAdPlacementMeta({
    slot: row.slot,
    pageKey: row.page_key ?? undefined,
    adType: row.ad_type ?? undefined,
    displayTrigger: row.display_trigger ?? undefined,
    placementKey: row.placement_key ?? undefined,
    roundNumber: row.round_number ?? undefined,
    sequenceIndex: row.sequence_index ?? undefined,
  });

  return {
    id: row.id,
    slot: row.slot,
    pageKey: placementMeta.pageKey,
    adType: placementMeta.adType,
    displayTrigger: placementMeta.displayTrigger,
    placementKey: placementMeta.placementKey,
    roundNumber: placementMeta.roundNumber,
    sequenceIndex: placementMeta.sequenceIndex,
    venueId: row.venue_id ?? undefined,
    venueIds: Array.isArray(row.venue_ids) ? row.venue_ids : row.venue_id ? [row.venue_id] : undefined,
    advertiserName: row.advertiser_name,
    deliveryWeight: Number.isFinite(Number(row.delivery_weight)) ? Math.max(1, Number(row.delivery_weight)) : 1,
    imageUrl: row.image_url,
    clickUrl: row.click_url,
    altText: row.alt_text,
    width: row.width,
    height: row.height,
    dismissDelaySeconds: Number.isFinite(Number(row.dismiss_delay_seconds))
      ? Math.min(300, Math.max(0, Math.round(Number(row.dismiss_delay_seconds))))
      : 3,
    popupCooldownSeconds: Number.isFinite(Number(row.popup_cooldown_seconds))
      ? Math.min(86400, Math.max(0, Math.round(Number(row.popup_cooldown_seconds))))
      : 180,
    active: row.active,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    impressions: row.impressions,
    clicks: row.clicks,
  };
}

function chooseWeightedRandomAd(rows: AdvertisementRow[]): AdvertisementRow | null {
  if (rows.length === 0) {
    return null;
  }

  let totalWeight = 0;
  for (const row of rows) {
    totalWeight += Number.isFinite(Number(row.delivery_weight))
      ? Math.max(1, Number(row.delivery_weight))
      : 1;
  }

  if (totalWeight <= 0) {
    return rows[0];
  }

  let threshold = Math.random() * totalWeight;
  for (const row of rows) {
    const weight = Number.isFinite(Number(row.delivery_weight))
      ? Math.max(1, Number(row.delivery_weight))
      : 1;
    threshold -= weight;
    if (threshold <= 0) {
      return row;
    }
  }

  return rows[rows.length - 1];
}

function chooseWeightedAdBySequence(rows: AdvertisementRow[], sequenceIndex: number): AdvertisementRow | null {
  if (rows.length === 0) {
    return null;
  }

  const safeSequence = Math.max(1, Math.round(sequenceIndex));
  const weights = rows.map((row) =>
    Number.isFinite(Number(row.delivery_weight)) ? Math.max(1, Number(row.delivery_weight)) : 1
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) {
    return rows[(safeSequence - 1) % rows.length] ?? rows[0] ?? null;
  }

  const target = ((safeSequence - 1) % totalWeight) + 1;
  let running = 0;
  for (let index = 0; index < rows.length; index += 1) {
    running += weights[index] ?? 1;
    if (target <= running) {
      return rows[index] ?? rows[0] ?? null;
    }
  }

  return rows[rows.length - 1] ?? null;
}

type AdLookupOptions = Partial<AdPlacementMeta> & {
  excludeAdIds?: string[];
  allowAnyVenue?: boolean;
};

async function getActiveAdQuery(slot: AdSlot, venueId?: string, options?: AdLookupOptions): Promise<Advertisement | null> {
  if (!supabaseAdmin) {
    return null;
  }

  const nowIso = new Date().toISOString();

  let query = supabaseAdmin
    .from("advertisements")
    .select(
      "id, slot, page_key, ad_type, display_trigger, placement_key, round_number, sequence_index, venue_id, venue_ids, advertiser_name, delivery_weight, image_url, click_url, alt_text, width, height, dismiss_delay_seconds, popup_cooldown_seconds, active, start_date, end_date, impressions, clicks"
    )
    .eq("slot", slot)
    .eq("active", true)
    .lte("start_date", nowIso)
    .or(`end_date.is.null,end_date.gte.${nowIso}`)
    .order("start_date", { ascending: false })
    .limit(100);

  if (options?.pageKey) {
    query = query.eq("page_key", options.pageKey);
  }
  if (options?.adType) {
    query = query.eq("ad_type", options.adType);
  }
  if (options?.displayTrigger) {
    query = query.eq("display_trigger", options.displayTrigger);
  }
  if (options?.placementKey) {
    query = query.eq("placement_key", options.placementKey);
  }

  if (options?.allowAnyVenue) {
    // Intentionally skip venue filter and allow any targeted join inline ad to fill this slot.
  } else if (venueId) {
    query = query.or(`venue_id.eq.${venueId},venue_ids.cs.{${venueId}}`);
  } else {
    query = query.is("venue_id", null).is("venue_ids", null);
  }

  const { data, error } = await query.returns<AdvertisementRow[]>();

  if (error || !data || data.length === 0) {
    return null;
  }

  const excluded = new Set((options?.excludeAdIds ?? []).map((id) => id.trim()).filter(Boolean));
  const rows = data.filter((row) => !excluded.has(row.id));
  if (rows.length === 0) {
    return null;
  }

  const requestedRound = Number.isFinite(options?.roundNumber) ? Math.round(Number(options?.roundNumber)) : undefined;
  const requestedSequence = Number.isFinite(options?.sequenceIndex)
    ? Math.round(Number(options?.sequenceIndex))
    : undefined;

  const filteredByRound = requestedRound
    ? rows.filter((row) => Number(row.round_number) === requestedRound)
    : rows;
  const roundPool = filteredByRound.length > 0 ? filteredByRound : rows;

  let sequencePool = roundPool;
  if (requestedSequence && options?.placementKey === "venue-leaderboard-inline") {
    const filteredBySequence = roundPool.filter((row) => Number(row.sequence_index) === requestedSequence);
    sequencePool = filteredBySequence.length > 0 ? filteredBySequence : roundPool;
  }

  if (requestedSequence && options?.placementKey === "predictions-inline" && sequencePool.length > 0) {
    const weightedRow = chooseWeightedAdBySequence(sequencePool, requestedSequence);
    return weightedRow ? mapAdRow(weightedRow) : null;
  }

  const pickedRow = chooseWeightedRandomAd(sequencePool);
  if (!pickedRow) {
    return null;
  }

  return mapAdRow(pickedRow);
}

export async function getActiveAdForSlot(slot: AdSlot, venueId?: string, options?: AdLookupOptions): Promise<Advertisement | null> {
  if (venueId) {
    const venueAd = await getActiveAdQuery(slot, venueId, options);
    if (venueAd) {
      return venueAd;
    }
  }

  return getActiveAdQuery(slot, undefined, options);
}

export async function getAdById(id: string): Promise<Advertisement | null> {
  if (!supabaseAdmin || !id) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("advertisements")
    .select(
      "id, slot, page_key, ad_type, display_trigger, placement_key, round_number, sequence_index, venue_id, venue_ids, advertiser_name, delivery_weight, image_url, click_url, alt_text, width, height, dismiss_delay_seconds, popup_cooldown_seconds, active, start_date, end_date, impressions, clicks"
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

async function insertAdEvent(id: string, eventType: AdEventType, context?: AdEventContext): Promise<void> {
  if (!supabaseAdmin || !id) {
    return;
  }

  const safeVenueId = context?.venueId?.trim() ?? "";
  const { error } = await supabaseAdmin.from("ad_events").insert({
    ad_id: id,
    event_type: eventType,
    page_key: context?.pageKey ?? null,
    venue_id: safeVenueId || null,
  });

  if (error) {
    // Ignore event-table errors so tracking never breaks the main request flow.
    return;
  }
}

export async function recordAdImpression(id: string, context?: AdEventContext): Promise<void> {
  await Promise.all([incrementCounter(id, "impressions"), insertAdEvent(id, "impression", context)]);
}

export async function recordAdClick(id: string, context?: AdEventContext): Promise<void> {
  await Promise.all([incrementCounter(id, "clicks"), insertAdEvent(id, "click", context)]);
}
