"use client";

import { useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { AdDisplayTrigger, AdPageKey, AdSlot, AdType, Advertisement, Venue } from "@/types";
import {
  AD_PLACEMENTS,
  getAllowedDisplayTriggers,
  getDefaultPlacementMeta,
  getSupportedAdTypesForPage,
  isSlotCompatibleWithAdType,
} from "@/lib/adPlacements";

export const AD_PAGE_OPTIONS: Array<{ value: AdPageKey; label: string }> = [
  { value: "join", label: "Join" },
  { value: "venue", label: "Venue" },
  { value: "trivia", label: "Live Trivia + Speed Trivia" },
  { value: "sports-bingo", label: "Sports Bingo" },
  { value: "pickem", label: "Pick 'Em" },
  { value: "fantasy", label: "Fantasy" },
];

export const AD_TYPE_OPTIONS: Array<{ value: AdType; label: string }> = [
  { value: "popup", label: "Pop-Up" },
  { value: "banner", label: "Banner" },
  { value: "inline", label: "Inline" },
];

export const AD_TRIGGER_OPTIONS: Array<{ value: AdDisplayTrigger; label: string }> = [
  { value: "on-load", label: "On Load" },
  { value: "on-scroll", label: "On Scroll" },
  { value: "round-end", label: "Round End" },
];

export const AD_SLOT_OPTIONS: Array<{ value: AdSlot; label: string }> = [
  { value: "popup-on-entry", label: "Popup (Entry)" },
  { value: "popup-on-scroll", label: "Popup (Scroll)" },
  { value: "mobile-adhesion", label: "Banner" },
  { value: "leaderboard-sidebar", label: "Inline" },
  { value: "inline-content", label: "Inline Content" },
  { value: "mid-content", label: "Mid Content" },
  { value: "header", label: "Header" },
  { value: "footer", label: "Footer" },
  { value: "sidebar", label: "Sidebar" },
];

export type AdDraft = {
  slot: AdSlot;
  pageKey: AdPageKey;
  adType: AdType;
  displayTrigger: AdDisplayTrigger;
  placementKey: string;
  roundNumber: string;
  cycleAfterRound: string;
  sequenceIndex: string;
  priority: string;
  advertiserName: string;
  imageUrl: string;
  clickUrl: string;
  altText: string;
  width: string;
  height: string;
  frequencyInterval: string;
  dismissDelaySeconds: string;
  popupCooldownSeconds: string;
  startDate: string;
  endDate: string;
  active: boolean;
  isPlaceholder: boolean;
  targetAllVenues: boolean;
  venueIds: string[];
  cities: string[];
  states: string[];
  zipCodes: string[];
  regions: string[];
};

function dedupeList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export function defaultAdDraft(): AdDraft {
  const today = new Date();
  const yyyyMmDd = today.toISOString().slice(0, 10);

  return {
    slot: "popup-on-entry",
    pageKey: "venue",
    adType: "popup",
    displayTrigger: "on-load",
    placementKey: "",
    roundNumber: "",
    cycleAfterRound: "",
    sequenceIndex: "",
    priority: "0",
    advertiserName: "",
    imageUrl: "",
    clickUrl: "https://",
    altText: "",
    width: "1080",
    height: "1080",
    frequencyInterval: "1",
    dismissDelaySeconds: "3",
    popupCooldownSeconds: "180",
    startDate: yyyyMmDd,
    endDate: "",
    active: true,
    isPlaceholder: false,
    targetAllVenues: true,
    venueIds: [],
    cities: [],
    states: [],
    zipCodes: [],
    regions: [],
  };
}

export function draftFromAdvertisement(ad: Advertisement): AdDraft {
  return {
    slot: ad.slot,
    pageKey: ad.pageKey,
    adType: ad.adType,
    displayTrigger: ad.displayTrigger,
    placementKey: ad.placementKey ?? "",
    roundNumber: ad.roundNumber ? String(ad.roundNumber) : "",
    cycleAfterRound: "",
    sequenceIndex: ad.sequenceIndex ? String(ad.sequenceIndex) : "",
    priority: String(ad.priority ?? 0),
    advertiserName: ad.advertiserName,
    imageUrl: ad.imageUrl,
    clickUrl: ad.clickUrl,
    altText: ad.altText,
    width: String(ad.width),
    height: String(ad.height),
    frequencyInterval: String(ad.frequencyInterval ?? 1),
    dismissDelaySeconds: String(ad.dismissDelaySeconds ?? 3),
    popupCooldownSeconds: String(ad.popupCooldownSeconds ?? 180),
    startDate: String(ad.startDate ?? "").slice(0, 10),
    endDate: String(ad.endDate ?? "").slice(0, 10),
    active: ad.active,
    isPlaceholder: Boolean(ad.isPlaceholder),
    targetAllVenues: Boolean(ad.targetAllVenues),
    venueIds: Array.isArray(ad.venueIds) ? ad.venueIds : [],
    cities: dedupeList([...(ad.cities ?? []), ...(ad.targetCities ?? [])]),
    states: dedupeList([...(ad.states ?? []), ...(ad.targetStates ?? [])]),
    zipCodes: dedupeList([...(ad.zipCodes ?? []), ...(ad.targetZipCodes ?? [])]),
    regions: dedupeList([...(ad.regions ?? []), ...(ad.targetRegions ?? [])]),
  };
}

export function draftToPayload(draft: AdDraft) {
  const roundNumber = draft.roundNumber.trim()
    ? Number.parseInt(draft.roundNumber, 10)
    : draft.cycleAfterRound.trim()
      ? Number.parseInt(draft.cycleAfterRound, 10)
      : undefined;

  const placementKey = draft.placementKey.trim() || (draft.cycleAfterRound.trim() ? `cycle-after-r${draft.cycleAfterRound.trim()}` : undefined);

  return {
    slot: draft.slot,
    pageKey: draft.pageKey,
    adType: draft.adType,
    displayTrigger: draft.displayTrigger,
    placementKey,
    roundNumber: Number.isFinite(roundNumber) ? roundNumber : undefined,
    sequenceIndex: draft.sequenceIndex.trim() ? Number.parseInt(draft.sequenceIndex, 10) : undefined,
    priority: Number.parseInt(draft.priority, 10) || 0,
    advertiserName: draft.advertiserName.trim(),
    imageUrl: draft.imageUrl.trim(),
    clickUrl: draft.clickUrl.trim(),
    altText: draft.altText.trim(),
    width: Number.parseInt(draft.width, 10) || 1,
    height: Number.parseInt(draft.height, 10) || 1,
    frequencyInterval: Number.parseInt(draft.frequencyInterval, 10) || 1,
    dismissDelaySeconds: Number.parseInt(draft.dismissDelaySeconds, 10) || 0,
    popupCooldownSeconds: Number.parseInt(draft.popupCooldownSeconds, 10) || 0,
    active: draft.active,
    isPlaceholder: draft.isPlaceholder,
    startDate: draft.startDate,
    endDate: draft.endDate || undefined,
    targetAllVenues: draft.targetAllVenues,
    venueIds: draft.targetAllVenues ? [] : draft.venueIds,
    cities: draft.cities,
    states: draft.states,
    zipCodes: draft.zipCodes,
    regions: draft.regions,
    // Backward-compat keys for older admin API callers.
    targetCities: draft.cities,
    targetStates: draft.states,
    targetZipCodes: draft.zipCodes,
    targetRegions: draft.regions,
  };
}

function venueTargetSummary(venues: Venue[], selectedIds: string[]): string {
  if (selectedIds.length === 0) return "No specific venues selected.";
  if (selectedIds.length <= 3) {
    return selectedIds
      .map((id) => venues.find((venue) => venue.id === id)?.name ?? id)
      .join(", ");
  }
  return `${selectedIds.length} venues selected`;
}

type Props = {
  draft: AdDraft;
  onChange: (next: AdDraft) => void;
  venues: Venue[];
  disabled?: boolean;
};

export function AdFormFields({ draft, onChange, venues, disabled = false }: Props) {
  function patch(patch: Partial<AdDraft>) {
    onChange({ ...draft, ...patch });
  }

  function normalizePlacement(
    nextPageKey: AdPageKey,
    nextAdType: AdType,
    preferredTrigger?: AdDisplayTrigger,
    preferredSlot?: AdSlot
  ) {
    const defaults = getDefaultPlacementMeta(nextPageKey, nextAdType);
    const allowedTriggers = getAllowedDisplayTriggers(nextPageKey, nextAdType);
    const nextTrigger =
      preferredTrigger && allowedTriggers.includes(preferredTrigger)
        ? preferredTrigger
        : defaults?.displayTrigger ?? "on-load";
    const fallbackSlot = defaults?.slot ?? "leaderboard-sidebar";
    const preferredCompatible = preferredSlot && isSlotCompatibleWithAdType(preferredSlot, nextAdType);
    const nextSlot = preferredCompatible ? preferredSlot : fallbackSlot;
    return { nextTrigger, nextSlot };
  }

  function handlePageChange(nextPageKey: AdPageKey) {
    const supportedTypes = getSupportedAdTypesForPage(nextPageKey);
    const nextAdType = supportedTypes.includes(draft.adType) ? draft.adType : supportedTypes[0] ?? "inline";
    const { nextTrigger, nextSlot } = normalizePlacement(nextPageKey, nextAdType, draft.displayTrigger, draft.slot);
    patch({
      pageKey: nextPageKey,
      adType: nextAdType,
      displayTrigger: nextTrigger,
      slot: nextSlot,
      ...(nextTrigger !== "round-end" ? { roundNumber: "", cycleAfterRound: "" } : {}),
    });
  }

  function handleAdTypeChange(nextAdType: AdType) {
    const { nextTrigger, nextSlot } = normalizePlacement(draft.pageKey, nextAdType, draft.displayTrigger, draft.slot);
    patch({
      adType: nextAdType,
      displayTrigger: nextTrigger,
      slot: nextSlot,
      ...(nextTrigger !== "round-end" ? { roundNumber: "", cycleAfterRound: "" } : {}),
    });
  }

  function handleTriggerChange(nextDisplayTrigger: AdDisplayTrigger) {
    const { nextTrigger, nextSlot } = normalizePlacement(draft.pageKey, draft.adType, nextDisplayTrigger, draft.slot);
    patch({
      displayTrigger: nextTrigger,
      slot: nextSlot,
      ...(nextTrigger !== "round-end" ? { roundNumber: "", cycleAfterRound: "" } : {}),
    });
  }

  function handleVenueMultiSelect(event: ChangeEvent<HTMLSelectElement>) {
    const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
    patch({ venueIds: selected });
  }

  const pagePlacement = draft.pageKey === "global" ? null : AD_PLACEMENTS[draft.pageKey];
  const allowedAdTypeOptions = getSupportedAdTypesForPage(draft.pageKey);
  const adTypeOptions = AD_TYPE_OPTIONS.filter((option) => allowedAdTypeOptions.includes(option.value));
  const allowedTriggers = getAllowedDisplayTriggers(draft.pageKey, draft.adType);
  const triggerOptions = AD_TRIGGER_OPTIONS.filter((option) => allowedTriggers.includes(option.value));
  const slotOptions = AD_SLOT_OPTIONS.filter((option) => isSlotCompatibleWithAdType(option.value, draft.adType));

  const isRoundEndTrivia = draft.pageKey === "trivia" && draft.displayTrigger === "round-end";
  const [cityInput, setCityInput] = useState("");
  const [stateInput, setStateInput] = useState("");
  const [zipInput, setZipInput] = useState("");
  const [regionInput, setRegionInput] = useState("");
  const [venueSearch, setVenueSearch] = useState("");

  const cityOptions = useMemo(
    () =>
      dedupeList(
        venues
          .map((venue) => venue.city ?? "")
          .map((value) => value.trim())
          .filter(Boolean)
      ),
    [venues]
  );
  const stateOptions = useMemo(
    () =>
      dedupeList(
        venues
          .map((venue) => venue.state ?? "")
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean)
      ),
    [venues]
  );
  const zipCodeOptions = useMemo(
    () =>
      dedupeList(
        venues
          .map((venue) => venue.zipCode ?? "")
          .map((value) => value.trim())
          .filter(Boolean)
      ),
    [venues]
  );
  const regionOptions = useMemo(
    () =>
      dedupeList(
        venues
          .map((venue) => venue.region ?? "")
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean)
      ),
    [venues]
  );
  const filteredVenueOptions = useMemo(() => {
    const query = venueSearch.trim().toLowerCase();
    if (!query) return venues;
    return venues.filter((venue) => {
      const name = venue.name.toLowerCase();
      const city = (venue.city ?? "").toLowerCase();
      const state = (venue.state ?? "").toLowerCase();
      return name.includes(query) || city.includes(query) || state.includes(query);
    });
  }, [venueSearch, venues]);

  function addMultiValue(field: "cities" | "states" | "zipCodes" | "regions", rawValue: string) {
    const cleaned = rawValue.trim();
    if (!cleaned) return;
    const normalized = field === "states" || field === "regions" ? cleaned.toUpperCase() : cleaned;
    patch({ [field]: dedupeList([...(draft[field] ?? []), normalized]) } as Partial<AdDraft>);
  }

  function removeMultiValue(field: "cities" | "states" | "zipCodes" | "regions", index: number) {
    const next = [...(draft[field] ?? [])];
    next.splice(index, 1);
    patch({ [field]: next } as Partial<AdDraft>);
  }

  function handleMultiInputKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    field: "cities" | "states" | "zipCodes" | "regions",
    value: string,
    reset: () => void
  ) {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    addMultiValue(field, value);
    reset();
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Advertiser *</label>
        <input
          value={draft.advertiserName}
          onChange={(event) => patch({ advertiserName: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Brand or campaign name"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Slot</label>
        <select
          value={draft.slot}
          onChange={(event) => patch({ slot: event.target.value as AdSlot })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {slotOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {pagePlacement ? (
          <p className="mt-1 text-xs text-slate-500">
            {pagePlacement.name}: {pagePlacement.slots[draft.adType].description}
          </p>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Page</label>
        <select
          value={draft.pageKey}
          onChange={(event) => handlePageChange(event.target.value as AdPageKey)}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {AD_PAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Ad Type</label>
        <select
          value={draft.adType}
          onChange={(event) => handleAdTypeChange(event.target.value as AdType)}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {adTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Trigger</label>
        <select
          value={draft.displayTrigger}
          onChange={(event) => handleTriggerChange(event.target.value as AdDisplayTrigger)}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {triggerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Placement Key</label>
        <input
          value={draft.placementKey}
          onChange={(event) => patch({ placementKey: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Optional custom placement key"
        />
      </div>

      {isRoundEndTrivia ? (
        <>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Round Number</label>
            <input
              type="number"
              min={1}
              max={24}
              value={draft.roundNumber}
              onChange={(event) => patch({ roundNumber: event.target.value })}
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="e.g. 1, 3, 5"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Queue After Round (Optional)</label>
            <input
              type="number"
              min={1}
              max={24}
              value={draft.cycleAfterRound}
              onChange={(event) => patch({ cycleAfterRound: event.target.value })}
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="e.g. 8"
            />
            <p className="mt-1 text-xs text-slate-500">Set this to configure a cycle start point (for example: after round 8).</p>
          </div>
        </>
      ) : null}

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Sequence Index</label>
        <input
          type="number"
          min={1}
          value={draft.sequenceIndex}
          onChange={(event) => patch({ sequenceIndex: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          placeholder="Used for inline ordering"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Priority</label>
        <input
          type="number"
          min={0}
          value={draft.priority}
          onChange={(event) => patch({ priority: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Image URL *</label>
        <input
          value={draft.imageUrl}
          onChange={(event) => patch({ imageUrl: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Click URL *</label>
        <input
          value={draft.clickUrl}
          onChange={(event) => patch({ clickUrl: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Alt Text *</label>
        <input
          value={draft.altText}
          onChange={(event) => patch({ altText: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Width</label>
        <input
          type="number"
          min={1}
          value={draft.width}
          onChange={(event) => patch({ width: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Height</label>
        <input
          type="number"
          min={1}
          value={draft.height}
          onChange={(event) => patch({ height: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Frequency Interval</label>
        <input
          type="number"
          min={1}
          value={draft.frequencyInterval}
          onChange={(event) => patch({ frequencyInterval: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Dismiss Delay (s)</label>
        <input
          type="number"
          min={0}
          value={draft.dismissDelaySeconds}
          onChange={(event) => patch({ dismissDelaySeconds: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Popup Cooldown (s)</label>
        <input
          type="number"
          min={0}
          value={draft.popupCooldownSeconds}
          onChange={(event) => patch({ popupCooldownSeconds: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Start Date *</label>
        <input
          type="date"
          value={draft.startDate}
          onChange={(event) => patch({ startDate: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">End Date</label>
        <input
          type="date"
          value={draft.endDate}
          onChange={(event) => patch({ endDate: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => patch({ active: event.target.checked })}
            disabled={disabled}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
          />
          Active
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.isPlaceholder}
            onChange={(event) => patch({ isPlaceholder: event.target.checked })}
            disabled={disabled}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
          />
          Placeholder Ad
        </label>
      </div>

      <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <h4 className="text-sm font-semibold text-slate-900">Geo & Venue Targeting</h4>
        <p className="mt-1 text-xs text-slate-500">Target everyone, specific venues, or precise locations by city/state/zip/region.</p>

        <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.targetAllVenues}
            onChange={(event) => patch({ targetAllVenues: event.target.checked, venueIds: event.target.checked ? [] : draft.venueIds })}
            disabled={disabled}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
          />
          Target All Venues
        </label>

        {!draft.targetAllVenues ? (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Specific Venues</label>
            <input
              value={venueSearch}
              onChange={(event) => setVenueSearch(event.target.value)}
              disabled={disabled}
              className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Search venues by name/city/state"
            />
            <select
              multiple
              value={draft.venueIds}
              onChange={handleVenueMultiSelect}
              disabled={disabled}
              className="h-28 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              {filteredVenueOptions.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                  {venue.city || venue.state ? ` (${[venue.city, venue.state].filter(Boolean).join(", ")})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">{venueTargetSummary(venues, draft.venueIds)}</p>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Cities</label>
            <div className="rounded-lg border border-slate-300 bg-white p-2">
              <div className="mb-2 flex flex-wrap gap-1">
                {draft.cities.map((value, index) => (
                  <span key={`${value}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {value}
                    <button
                      type="button"
                      onClick={() => removeMultiValue("cities", index)}
                      disabled={disabled}
                      className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={cityInput}
                  list="ad-city-options"
                  onChange={(event) => setCityInput(event.target.value)}
                  onKeyDown={(event) => handleMultiInputKeyDown(event, "cities", cityInput, () => setCityInput(""))}
                  disabled={disabled}
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="Type a city and press Enter"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    addMultiValue("cities", cityInput);
                    setCityInput("");
                  }}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <datalist id="ad-city-options">
                {cityOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">States</label>
            <div className="rounded-lg border border-slate-300 bg-white p-2">
              <div className="mb-2 flex flex-wrap gap-1">
                {draft.states.map((value, index) => (
                  <span key={`${value}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {value}
                    <button
                      type="button"
                      onClick={() => removeMultiValue("states", index)}
                      disabled={disabled}
                      className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={stateInput}
                  list="ad-state-options"
                  onChange={(event) => setStateInput(event.target.value)}
                  onKeyDown={(event) => handleMultiInputKeyDown(event, "states", stateInput, () => setStateInput(""))}
                  disabled={disabled}
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="Type a state code and press Enter"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    addMultiValue("states", stateInput);
                    setStateInput("");
                  }}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <datalist id="ad-state-options">
                {stateOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Zip Codes</label>
            <div className="rounded-lg border border-slate-300 bg-white p-2">
              <div className="mb-2 flex flex-wrap gap-1">
                {draft.zipCodes.map((value, index) => (
                  <span key={`${value}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {value}
                    <button
                      type="button"
                      onClick={() => removeMultiValue("zipCodes", index)}
                      disabled={disabled}
                      className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={zipInput}
                  list="ad-zip-options"
                  onChange={(event) => setZipInput(event.target.value)}
                  onKeyDown={(event) => handleMultiInputKeyDown(event, "zipCodes", zipInput, () => setZipInput(""))}
                  disabled={disabled}
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="Type a zip code and press Enter"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    addMultiValue("zipCodes", zipInput);
                    setZipInput("");
                  }}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <datalist id="ad-zip-options">
                {zipCodeOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Regions</label>
            <div className="rounded-lg border border-slate-300 bg-white p-2">
              <div className="mb-2 flex flex-wrap gap-1">
                {draft.regions.map((value, index) => (
                  <span key={`${value}-${index}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {value}
                    <button
                      type="button"
                      onClick={() => removeMultiValue("regions", index)}
                      disabled={disabled}
                      className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={regionInput}
                  list="ad-region-options"
                  onChange={(event) => setRegionInput(event.target.value)}
                  onKeyDown={(event) => handleMultiInputKeyDown(event, "regions", regionInput, () => setRegionInput(""))}
                  disabled={disabled}
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="Type a region and press Enter"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    addMultiValue("regions", regionInput);
                    setRegionInput("");
                  }}
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <datalist id="ad-region-options">
                {regionOptions.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
