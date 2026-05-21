import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { AdDisplayTrigger, AdPageKey, AdSlot, AdType, Advertisement } from "@/types";

type AdEventType = "impression" | "click";
type AdEventContext = {
  pageKey?: AdPageKey;
  venueId?: string;
};

type AdvertisementRow = {
  id: string;
  slot: AdSlot;
  slot_key: string;
  priority: number;
  is_placeholder: boolean | null;
  page_key: AdPageKey | null;
  ad_type: AdType | null;
  display_trigger: AdDisplayTrigger | null;
  placement_key: string | null;
  round_number: number | null;
  sequence_index: number | null;
  venue_id: string | null;
  venue_ids: string[] | null;
  target_all_venues: boolean | null;
  target_cities: string[] | null;
  target_zip_codes: string[] | null;
  target_counties: string[] | null;
  target_states: string[] | null;
  target_regions: string[] | null;
  advertiser_name: string;
  frequency_interval: number | null;
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

const AD_SELECT =
  "id, slot, slot_key, priority, is_placeholder, page_key, ad_type, display_trigger, placement_key, round_number, sequence_index, venue_id, venue_ids, target_all_venues, target_cities, target_zip_codes, target_counties, target_states, target_regions, advertiser_name, frequency_interval, image_url, click_url, alt_text, width, height, dismiss_delay_seconds, popup_cooldown_seconds, active, start_date, end_date, impressions, clicks";

function mapAdRow(row: AdvertisementRow): Advertisement {
  const venueIds = Array.isArray(row.venue_ids) ? row.venue_ids : row.venue_id ? [row.venue_id] : [];
  const cities = Array.isArray(row.target_cities) ? row.target_cities : [];
  const zipCodes = Array.isArray(row.target_zip_codes) ? row.target_zip_codes : [];
  const counties = Array.isArray(row.target_counties) ? row.target_counties : [];
  const states = Array.isArray(row.target_states) ? row.target_states : [];
  const regions = Array.isArray(row.target_regions) ? row.target_regions : [];

  return {
    id: row.id,
    slot: row.slot,
    slotKey: row.slot_key,
    priority: row.priority ?? 0,
    isPlaceholder: Boolean(row.is_placeholder ?? false),
    pageKey: (row.page_key ?? "global") as AdPageKey,
    adType: (row.ad_type ?? "inline") as AdType,
    displayTrigger: (row.display_trigger ?? "on-load") as AdDisplayTrigger,
    placementKey: row.placement_key ?? undefined,
    roundNumber: row.round_number ?? undefined,
    sequenceIndex: row.sequence_index ?? undefined,
    venueIds,
    targetAllVenues: Boolean(row.target_all_venues ?? false),
    cities,
    zipCodes,
    counties,
    states,
    regions,
    targetCities: cities,
    targetZipCodes: zipCodes,
    targetCounties: counties,
    targetStates: states,
    targetRegions: regions,
    advertiserName: row.advertiser_name,
    frequencyInterval: Number.isFinite(Number(row.frequency_interval)) ? Math.max(1, Number(row.frequency_interval)) : 1,
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

/**
 * Pick the ad to serve using a deterministic round-robin rotation based on the
 * client's page-load counter.
 */
function chooseAdByCounter(rows: AdvertisementRow[], counter: number): AdvertisementRow | null {
  if (rows.length === 0) return null;
  const safeCounter = Math.max(0, Math.round(counter));
  return rows[safeCounter % rows.length] ?? rows[0] ?? null;
}

function isMustServePopup(row: AdvertisementRow): boolean {
  const interval = Number.isFinite(Number(row.frequency_interval)) ? Math.max(1, Number(row.frequency_interval)) : 1;
  const cooldown = Number.isFinite(Number(row.popup_cooldown_seconds))
    ? Math.max(0, Math.round(Number(row.popup_cooldown_seconds)))
    : 180;
  return interval === 1 && cooldown === 0;
}

type AdLookupOptions = {
  pageKey?: AdPageKey;
  adType?: AdType;
  displayTrigger?: AdDisplayTrigger;
  placementKey?: string;
  roundNumber?: number;
  sequenceIndex?: number;
  excludeAdIds?: string[];
  allowAnyVenue?: boolean;
  clientCounter?: number;
};

type VenueGeoContext = {
  city: string;
  zipCode: string;
  county: string;
  state: string;
  region: string;
};

const US_REGION_BY_STATE: Record<string, string> = {
  CT: "NORTHEAST", ME: "NORTHEAST", MA: "NORTHEAST", NH: "NORTHEAST", RI: "NORTHEAST", VT: "NORTHEAST",
  NJ: "NORTHEAST", NY: "NORTHEAST", PA: "NORTHEAST",
  IL: "MIDWEST", IN: "MIDWEST", MI: "MIDWEST", OH: "MIDWEST", WI: "MIDWEST",
  IA: "MIDWEST", KS: "MIDWEST", MN: "MIDWEST", MO: "MIDWEST", NE: "MIDWEST", ND: "MIDWEST", SD: "MIDWEST",
  DE: "SOUTH", FL: "SOUTH", GA: "SOUTH", MD: "SOUTH", NC: "SOUTH", SC: "SOUTH", VA: "SOUTH", DC: "SOUTH", WV: "SOUTH",
  AL: "SOUTH", KY: "SOUTH", MS: "SOUTH", TN: "SOUTH",
  AR: "SOUTH", LA: "SOUTH", OK: "SOUTH", TX: "SOUTH",
  AZ: "WEST", CO: "WEST", ID: "WEST", MT: "WEST", NV: "WEST", NM: "WEST", UT: "WEST", WY: "WEST",
  AK: "WEST", CA: "WEST", HI: "WEST", OR: "WEST", WA: "WEST",
};

function cleanGeoValue(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

async function getVenueGeoContext(venueId?: string): Promise<VenueGeoContext | null> {
  if (!supabaseAdmin || !venueId) return null;
  try {
    const { data } = await supabaseAdmin
      .from("venues")
      .select("city, zip_code, county, state, region")
      .eq("id", venueId)
      .maybeSingle<{ city?: string | null; zip_code?: string | null; county?: string | null; state?: string | null; region?: string | null }>();
    if (!data) return null;
    const state = cleanGeoValue(data.state);
    const region = cleanGeoValue(data.region) || US_REGION_BY_STATE[state] || "";
    return {
      city: cleanGeoValue(data.city),
      zipCode: cleanGeoValue(data.zip_code),
      county: cleanGeoValue(data.county),
      state,
      region,
    };
  } catch {
    return null;
  }
}

function matchesGeoTarget(row: AdvertisementRow, venueGeo: VenueGeoContext | null): boolean {
  const hasGeoTargets =
    (row.target_cities?.length ?? 0) > 0 ||
    (row.target_zip_codes?.length ?? 0) > 0 ||
    (row.target_counties?.length ?? 0) > 0 ||
    (row.target_states?.length ?? 0) > 0 ||
    (row.target_regions?.length ?? 0) > 0;
  if (row.target_all_venues) return true;
  if (!hasGeoTargets) return true;
  if (!venueGeo) return false;
  const includesAny = (source: string[] | null | undefined, value: string) =>
    value ? (source ?? []).map((item) => cleanGeoValue(item)).includes(value) : false;
  const cityOk = (row.target_cities?.length ?? 0) === 0 || includesAny(row.target_cities, venueGeo.city);
  const zipOk = (row.target_zip_codes?.length ?? 0) === 0 || includesAny(row.target_zip_codes, venueGeo.zipCode);
  const countyOk = (row.target_counties?.length ?? 0) === 0 || includesAny(row.target_counties, venueGeo.county);
  const stateOk = (row.target_states?.length ?? 0) === 0 || includesAny(row.target_states, venueGeo.state);
  const regionOk = (row.target_regions?.length ?? 0) === 0 || includesAny(row.target_regions, venueGeo.region);
  return cityOk && zipOk && countyOk && stateOk && regionOk;
}

function applyVenueFilter(
  rows: AdvertisementRow[],
  venueId: string | undefined,
  allowAnyVenue: boolean,
  excluded: Set<string>,
  venueGeo: VenueGeoContext | null
): AdvertisementRow[] {
  return rows.filter((row) => {
    if (excluded.has(row.id)) return false;
    if (allowAnyVenue) return true;
    const targetedVenueIds = Array.isArray(row.venue_ids)
      ? row.venue_ids.filter(Boolean)
      : row.venue_id
        ? [row.venue_id]
        : [];
    const venueMatch = targetedVenueIds.length === 0 || (venueId ? targetedVenueIds.includes(venueId) : false);
    return venueMatch && matchesGeoTarget(row, venueGeo);
  });
}

// ─── Legacy slot-based query (backward compatible) ────────────────────────────

async function getActiveAdQuery(slot: AdSlot, venueId?: string, options?: AdLookupOptions): Promise<Advertisement | null> {
  if (!supabaseAdmin) return null;

  const nowIso = new Date().toISOString();

  let query = supabaseAdmin
    .from("advertisements")
    .select(AD_SELECT)
    .eq("slot", slot)
    .eq("active", true)
    .lte("start_date", nowIso)
    .or(`end_date.is.null,end_date.gte.${nowIso}`)
    .order("start_date", { ascending: false })
    .limit(100);

  if (options?.pageKey) query = query.eq("page_key", options.pageKey);
  if (options?.adType) query = query.eq("ad_type", options.adType);
  if (options?.displayTrigger) query = query.eq("display_trigger", options.displayTrigger);
  if (options?.placementKey) query = query.eq("placement_key", options.placementKey);

  const { data, error } = await query.returns<AdvertisementRow[]>();
  if (error || !data || data.length === 0) return null;

  const excluded = new Set((options?.excludeAdIds ?? []).map((id) => id.trim()).filter(Boolean));
  const venueGeo = await getVenueGeoContext(venueId);
  const rows = applyVenueFilter(data, venueId, options?.allowAnyVenue ?? false, excluded, venueGeo);
  if (rows.length === 0) return null;

  const nonPlaceholders = rows.filter((r) => !r.is_placeholder);
  const pool = nonPlaceholders.length > 0 ? nonPlaceholders : rows.filter((r) => Boolean(r.is_placeholder));
  if (pool.length === 0) return null;

  const requestedRound = Number.isFinite(options?.roundNumber) ? Math.round(Number(options?.roundNumber)) : undefined;
  const requestedSequence = Number.isFinite(options?.sequenceIndex) ? Math.round(Number(options?.sequenceIndex)) : undefined;

  const filteredByRound = requestedRound ? pool.filter((r) => Number(r.round_number) === requestedRound) : pool;
  const roundPool = filteredByRound.length > 0 ? filteredByRound : pool;

  const isStrictLeaderboardVariantRequest =
    options?.placementKey === "venue-leaderboard-inline" && Number.isFinite(requestedSequence) && Number(requestedSequence) >= 1;

  let sequencePool = roundPool;
  if (requestedSequence && options?.placementKey === "venue-leaderboard-inline") {
    const filteredBySequence = roundPool.filter((r) => Number(r.sequence_index) === requestedSequence);
    if (filteredBySequence.length === 0) return null;
    sequencePool = filteredBySequence;
  }

  const counter = Number.isFinite(options?.clientCounter) ? Math.max(0, Math.round(Number(options?.clientCounter))) : 0;

  if (options?.adType === "popup") {
    const mustServePool = sequencePool.filter(isMustServePopup);
    if (mustServePool.length > 0) {
      const chosen = chooseAdByCounter(mustServePool, counter);
      return chosen ? mapAdRow(chosen) : null;
    }
  }

  const pickedRow = chooseAdByCounter(sequencePool, counter);
  if (!pickedRow) return null;

  const interval = Number.isFinite(Number(pickedRow.frequency_interval)) ? Math.max(1, Number(pickedRow.frequency_interval)) : 1;
  if (!isStrictLeaderboardVariantRequest && interval > 1 && counter > 0 && counter % interval !== 0) return null;

  return mapAdRow(pickedRow);
}

export async function getActiveAdForSlot(slot: AdSlot, venueId?: string, options?: AdLookupOptions): Promise<Advertisement | null> {
  const isStrictLeaderboardVariantRequest =
    options?.placementKey === "venue-leaderboard-inline" &&
    Number.isFinite(options?.sequenceIndex) &&
    Number(options?.sequenceIndex) >= 1;

  if (venueId) {
    const venueAd = await getActiveAdQuery(slot, venueId, options);
    if (venueAd) return venueAd;
    if (isStrictLeaderboardVariantRequest) return null;
  }

  return getActiveAdQuery(slot, undefined, options);
}

// ─── New slot_key-based query (priority-ordered, no normalization) ─────────────

type SlotKeyOptions = {
  excludeAdIds?: string[];
  allowAnyVenue?: boolean;
  clientCounter?: number;
};

async function getAdForSlotKeyQuery(slotKey: string, venueId?: string, options?: SlotKeyOptions): Promise<Advertisement | null> {
  if (!supabaseAdmin) return null;

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("advertisements")
    .select(AD_SELECT)
    .eq("slot_key", slotKey)
    .eq("active", true)
    .lte("start_date", nowIso)
    .or(`end_date.is.null,end_date.gte.${nowIso}`)
    .order("priority", { ascending: true })
    .limit(50)
    .returns<AdvertisementRow[]>();

  if (error || !data || data.length === 0) return null;

  const excluded = new Set((options?.excludeAdIds ?? []).map((id) => id.trim()).filter(Boolean));
  const venueGeo = await getVenueGeoContext(venueId);
  const rows = applyVenueFilter(data, venueId, options?.allowAnyVenue ?? false, excluded, venueGeo);
  if (rows.length === 0) return null;

  const nonPlaceholders = rows.filter((r) => !r.is_placeholder);
  const pool = nonPlaceholders.length > 0 ? nonPlaceholders : rows.filter((r) => Boolean(r.is_placeholder));
  if (pool.length === 0) return null;

  // Priority ordering: serve the highest-priority (lowest number) ad.
  // Apply frequency gate so the ad isn't shown every single page load.
  const counter = Number.isFinite(options?.clientCounter) ? Math.max(0, Math.round(Number(options?.clientCounter))) : 0;

  for (const row of pool) {
    const interval = Number.isFinite(Number(row.frequency_interval)) ? Math.max(1, Number(row.frequency_interval)) : 1;
    if (interval > 1 && counter > 0 && counter % interval !== 0) continue;
    if (row.ad_type === "popup" && !isMustServePopup(row) && interval > 1 && counter > 0 && counter % interval !== 0) continue;
    return mapAdRow(row);
  }

  return null;
}

export async function getAdForSlotKey(slotKey: string, venueId?: string, options?: SlotKeyOptions): Promise<Advertisement | null> {
  if (venueId) {
    const venueAd = await getAdForSlotKeyQuery(slotKey, venueId, options);
    if (venueAd) return venueAd;
  }
  return getAdForSlotKeyQuery(slotKey, undefined, options);
}

// ─── Single ad by ID ──────────────────────────────────────────────────────────

export async function getAdById(id: string): Promise<Advertisement | null> {
  if (!supabaseAdmin || !id) return null;

  const { data, error } = await supabaseAdmin
    .from("advertisements")
    .select(AD_SELECT)
    .eq("id", id)
    .maybeSingle<AdvertisementRow>();

  if (error || !data) return null;
  return mapAdRow(data);
}

// ─── Event tracking ───────────────────────────────────────────────────────────

async function incrementCounter(id: string, field: "impressions" | "clicks"): Promise<void> {
  if (!supabaseAdmin || !id) return;

  const { data, error } = await supabaseAdmin
    .from("advertisements")
    .select(field)
    .eq("id", id)
    .maybeSingle<{ impressions?: number; clicks?: number }>();

  if (error || !data) return;

  const currentValue = Number(data[field] ?? 0);
  await supabaseAdmin
    .from("advertisements")
    .update({ [field]: currentValue + 1 })
    .eq("id", id);
}

async function insertAdEvent(id: string, eventType: AdEventType, context?: AdEventContext): Promise<void> {
  if (!supabaseAdmin || !id) return;

  const safeVenueId = context?.venueId?.trim() ?? "";
  const { error } = await supabaseAdmin.from("ad_events").insert({
    ad_id: id,
    event_type: eventType,
    page_key: context?.pageKey ?? null,
    venue_id: safeVenueId || null,
  });

  if (error) return;
}

export async function recordAdImpression(id: string, context?: AdEventContext): Promise<void> {
  await Promise.all([incrementCounter(id, "impressions"), insertAdEvent(id, "impression", context)]);
}

export async function recordAdClick(id: string, context?: AdEventContext): Promise<void> {
  await Promise.all([incrementCounter(id, "clicks"), insertAdEvent(id, "click", context)]);
}
