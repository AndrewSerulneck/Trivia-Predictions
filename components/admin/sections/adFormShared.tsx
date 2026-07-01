/* Codex: Page -> Ad Type -> Slot dependent dropdowns implemented */
"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { adminLabel } from "@/lib/adminStyles";
import type { AdDisplayTrigger, AdPageKey, AdSlot, AdType, Advertisement, Venue } from "@/types";
import {
  AD_PLACEMENTS,
  getAllowedDisplayTriggers,
  getDefaultPlacementMeta,
  isSlotCompatibleWithAdType,
} from "@/lib/adPlacements";
import { AD_SLOT_REGISTRY } from "@/lib/adSlotRegistry";

export const AD_PAGE_OPTIONS: Array<{ value: AdPageKey; label: string }> = [
  { value: "join", label: "Join" },
  { value: "venue", label: "Venue Home Page" },
  { value: "speed-trivia", label: "Speed Trivia" },
  { value: "live-trivia", label: "Live Trivia" },
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

type RegistrySlotOption = {
  id: string;
  slot: AdSlot;
  label: string;
  trigger: AdDisplayTrigger;
  roundNumber?: number;
};

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

const VENUE_LEADERBOARD_PLACEMENT_KEY = "venue-leaderboard-inline";
const VENUE_LEADERBOARD_SLOT_PATTERN = /^venue-leaderboard-rows-\d+-\d+$/;

function isVenueLeaderboardSlot(pageKey: AdPageKey, slot: AdSlot): boolean {
  return pageKey === "venue" && VENUE_LEADERBOARD_SLOT_PATTERN.test(slot);
}

function isValidVenueLeaderboardSequenceIndex(value: string | number | undefined): boolean {
  const parsed =
    typeof value === "number"
      ? Math.round(value)
      : Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5;
}

function getDefaultDimensionsForAdType(adType: AdType): { width: string; height: string } {
  switch (adType) {
    case "popup":
      return { width: "540", height: "960" };
    case "banner":
      return { width: "320", height: "50" };
    case "inline":
      return { width: "300", height: "250" };
    default:
      return { width: "300", height: "250" };
  }
}

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

function getSlotHintForPage(pageKey: AdPageKey, slot: AdSlot): string {
  if (slot === "inline-content") {
    switch (pageKey) {
      case "pickem":
        if (slot.startsWith("pickem-inline-cards-")) {
          return "Appears in specific Pick 'Em card range";
        }
        return "Generic inline placement (deprecated for Pick 'Em)";
      case "sports-bingo":
        return "Appears within Bingo game area";
      case "fantasy":
        return "Appears in Fantasy player feed";
      case "live-trivia":
        return "Appears in Live Trivia lobby content";
      case "join":
        return "Appears between venue listings";
      default:
        return "Inline ad placement";
    }
  }
  if (slot.startsWith("venue-leaderboard-rows-")) {
    return "Appears on Venue leaderboard at this row range";
  }
  if (slot.startsWith("pickem-inline-cards-")) {
    return "Specific Pick 'Em inline ad slot for card range shown";
  }
  return "";
}

function getAvailableAdTypesForPage(pageKey?: AdPageKey): AdType[] {
  if (!pageKey) return [];
  const pageSlots = Array.from(
    new Set(AD_SLOT_REGISTRY.filter((entry) => entry.pageKey === pageKey).map((entry) => entry.slot))
  );
  return AD_TYPE_OPTIONS.map((option) => option.value).filter((adType) =>
    pageSlots.some((slot) => isSlotCompatibleWithAdType(slot, adType))
  );
}

function getAvailableSlotsForPageAndType(
  pageKey?: AdPageKey,
  adType?: AdType
) : RegistrySlotOption[] {
  if (!pageKey || !adType) return [];

  return AD_SLOT_REGISTRY
    .filter((entry) => entry.pageKey === pageKey && isSlotCompatibleWithAdType(entry.slot, adType))
    .map((entry) => ({
      id: entry.id,
      slot: entry.slot,
      label: entry.label,
      trigger: entry.trigger,
      roundNumber: entry.roundNumber,
    }));
}

function getDraftSlotOptionId(draft: AdDraft, slotOptions: RegistrySlotOption[]): string {
  const draftRoundNumber = draft.roundNumber.trim() ? Number.parseInt(draft.roundNumber, 10) : undefined;
  const exactMatch = slotOptions.find(
    (option) =>
      option.slot === draft.slot &&
      option.trigger === draft.displayTrigger &&
      (option.roundNumber ?? undefined) === (Number.isFinite(draftRoundNumber) ? draftRoundNumber : undefined)
  );
  return exactMatch?.id ?? "";
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
  // Venue leaderboard inline slots need explicit variant targeting so rendering can match sequence breaks.
  if (
    isVenueLeaderboardSlot(draft.pageKey, draft.slot) &&
    (placementKey !== VENUE_LEADERBOARD_PLACEMENT_KEY || !isValidVenueLeaderboardSequenceIndex(draft.sequenceIndex))
  ) {
    throw new Error("Leaderboard inline ads require placementKey='venue-leaderboard-inline' and sequenceIndex 1-5.");
  }

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
  onApplyPlaceholderToAllInlineSlots?: () => Promise<void> | void;
  applyingPlaceholderToAllInlineSlots?: boolean;
  placeholderApplySummary?: string;
};

export function AdFormFields({
  draft,
  onChange,
  venues,
  disabled = false,
  onApplyPlaceholderToAllInlineSlots,
  applyingPlaceholderToAllInlineSlots = false,
  placeholderApplySummary = "",
}: Props) {
  const [didAutoSetLeaderboardPlacementKey, setDidAutoSetLeaderboardPlacementKey] = useState(false);
  const [didAutoSetLeaderboardSequenceIndex, setDidAutoSetLeaderboardSequenceIndex] = useState(false);

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
    const fallbackSlot =
      defaults?.slot ??
      (nextAdType === "popup" ? "popup-on-entry" : nextAdType === "banner" ? "mobile-adhesion" : "inline-content");
    const preferredCompatible = preferredSlot && isSlotCompatibleWithAdType(preferredSlot, nextAdType);
    const nextSlot = preferredCompatible ? preferredSlot : fallbackSlot;
    return { nextTrigger, nextSlot };
  }

  function handlePageChange(nextPageKey: AdPageKey) {
    const supportedTypes = getAvailableAdTypesForPage(nextPageKey);
    const nextAdType = supportedTypes.includes(draft.adType) ? draft.adType : supportedTypes[0] ?? "inline";
    const { nextTrigger, nextSlot } = normalizePlacement(nextPageKey, nextAdType, draft.displayTrigger);
    patch({
      pageKey: nextPageKey,
      adType: nextAdType,
      displayTrigger: nextTrigger,
      slot: nextSlot,
      ...(nextTrigger !== "round-end" ? { roundNumber: "", cycleAfterRound: "" } : {}),
    });
  }

  function handleAdTypeChange(nextAdType: AdType) {
    const { nextTrigger, nextSlot } = normalizePlacement(draft.pageKey, nextAdType, draft.displayTrigger);
    const dimensions = getDefaultDimensionsForAdType(nextAdType);
    patch({
      adType: nextAdType,
      displayTrigger: nextTrigger,
      slot: nextSlot,
      ...(nextTrigger !== "round-end" ? { roundNumber: "", cycleAfterRound: "" } : {}),
      width: dimensions.width,
      height: dimensions.height,
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

  function handleSlotOptionChange(optionId: string) {
    const selected = slotOptions.find((option) => option.id === optionId);
    if (!selected) return;
    patch({
      slot: selected.slot,
      displayTrigger: selected.trigger,
      roundNumber: Number.isFinite(selected.roundNumber) ? String(selected.roundNumber) : "",
      ...(selected.trigger !== "round-end" ? { cycleAfterRound: "" } : {}),
    });
  }

  function handleVenueMultiSelect(event: ChangeEvent<HTMLSelectElement>) {
    const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
    patch({ venueIds: selected });
  }

  const pagePlacement = draft.pageKey === "global" ? null : AD_PLACEMENTS[draft.pageKey];
  const availableAdTypes = getAvailableAdTypesForPage(draft.pageKey);
  const adTypeOptions = AD_TYPE_OPTIONS.filter((option) => availableAdTypes.includes(option.value));
  const allowedTriggers = getAllowedDisplayTriggers(draft.pageKey, draft.adType);
  const triggerOptions = AD_TRIGGER_OPTIONS.filter((option) => allowedTriggers.includes(option.value));
  const slotOptions = getAvailableSlotsForPageAndType(draft.pageKey, draft.adType);
  const selectedSlotOptionId = getDraftSlotOptionId(draft, slotOptions) || slotOptions[0]?.id || "";
  const slotHint = getSlotHintForPage(draft.pageKey, draft.slot);
  const isVenueLeaderboardSelection = isVenueLeaderboardSlot(draft.pageKey, draft.slot);
  const hasValidLeaderboardSequence = isValidVenueLeaderboardSequenceIndex(draft.sequenceIndex);

  useEffect(() => {
    if (slotOptions.length === 0) {
      return;
    }
    if (getDraftSlotOptionId(draft, slotOptions)) {
      return;
    }
    const first = slotOptions[0];
    if (!first) return;
    onChange({
      ...draft,
      slot: first.slot,
      displayTrigger: first.trigger,
      roundNumber: Number.isFinite(first.roundNumber) ? String(first.roundNumber) : "",
      ...(first.trigger !== "round-end" ? { cycleAfterRound: "" } : {}),
    });
  }, [draft, onChange, slotOptions]);

  useEffect(() => {
    if (isVenueLeaderboardSelection) {
      const nextPatch: Partial<AdDraft> = {};
      if (draft.placementKey !== VENUE_LEADERBOARD_PLACEMENT_KEY) {
        // Keep this deterministic for leaderboard inline lookups.
        nextPatch.placementKey = VENUE_LEADERBOARD_PLACEMENT_KEY;
        setDidAutoSetLeaderboardPlacementKey(true);
      }
      if (!hasValidLeaderboardSequence) {
        // Default to sequence 1 so newly selected leaderboard slots stay valid.
        nextPatch.sequenceIndex = "1";
        setDidAutoSetLeaderboardSequenceIndex(true);
      }
      if (Object.keys(nextPatch).length > 0) {
        onChange({ ...draft, ...nextPatch });
      }
      return;
    }

    const clearPatch: Partial<AdDraft> = {};
    if (didAutoSetLeaderboardPlacementKey && draft.placementKey === VENUE_LEADERBOARD_PLACEMENT_KEY) {
      clearPatch.placementKey = "";
    }
    if (didAutoSetLeaderboardSequenceIndex && draft.sequenceIndex.trim()) {
      clearPatch.sequenceIndex = "";
    }
    if (Object.keys(clearPatch).length > 0) {
      onChange({ ...draft, ...clearPatch });
    }
    if (didAutoSetLeaderboardPlacementKey) setDidAutoSetLeaderboardPlacementKey(false);
    if (didAutoSetLeaderboardSequenceIndex) setDidAutoSetLeaderboardSequenceIndex(false);
  }, [
    didAutoSetLeaderboardPlacementKey,
    didAutoSetLeaderboardSequenceIndex,
    draft,
    hasValidLeaderboardSequence,
    isVenueLeaderboardSelection,
    onChange,
  ]);

  const isRoundEndTrivia = (draft.pageKey === "trivia" || draft.pageKey === "speed-trivia" || draft.pageKey === "live-trivia") && draft.displayTrigger === "round-end";
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
        <label className={adminLabel}>Advertiser *</label>
        <input
          value={draft.advertiserName}
          onChange={(event) => patch({ advertiserName: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          placeholder="Brand or campaign name"
        />
      </div>
      <div>
        <label className={adminLabel}>Page</label>
        <select
          value={draft.pageKey}
          onChange={(event) => handlePageChange(event.target.value as AdPageKey)}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        >
          {AD_PAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={adminLabel}>Ad Type</label>
        <select
          value={draft.adType}
          onChange={(event) => handleAdTypeChange(event.target.value as AdType)}
          disabled={disabled || !draft.pageKey || adTypeOptions.length === 0}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        >
          {adTypeOptions.length === 0 ? (
            <option value="">No ad types available for this page</option>
          ) : null}
          {adTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={adminLabel}>Slot</label>
        <select
          value={selectedSlotOptionId}
          onChange={(event) => handleSlotOptionChange(event.target.value)}
          disabled={disabled || !draft.pageKey || !draft.adType || slotOptions.length === 0}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        >
          {slotOptions.length === 0 ? (
            <option value="">No slots available for this page & ad type</option>
          ) : null}
          {slotOptions.map((option) => {
            const displayLabel = `${option.id} — ${option.label}`;
            return (
              <option key={option.id} value={option.id}>
                {displayLabel}
              </option>
            );
          })}
        </select>
        {pagePlacement ? (
          <p className="mt-1 text-xs text-slate-500">
            {pagePlacement.name}: {pagePlacement.slots[draft.adType]?.description}
          </p>
        ) : null}
        {slotHint ? (
          <p className="mt-2 text-xs italic text-slate-500">
            💡 {slotHint}
          </p>
        ) : null}
        {isVenueLeaderboardSelection ? (
          <p className="mt-1 text-xs text-indigo-600">
            Leaderboard slots require placement key <code>{VENUE_LEADERBOARD_PLACEMENT_KEY}</code> and sequence index 1-5.
          </p>
        ) : null}
      </div>

      <div>
        <label className={adminLabel}>Trigger</label>
        <select
          value={draft.displayTrigger}
          onChange={(event) => handleTriggerChange(event.target.value as AdDisplayTrigger)}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        >
          {triggerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={adminLabel}>Placement Key</label>
        <input
          value={draft.placementKey}
          onChange={(event) => patch({ placementKey: event.target.value })}
          disabled={disabled || isVenueLeaderboardSelection}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          placeholder={isVenueLeaderboardSelection ? VENUE_LEADERBOARD_PLACEMENT_KEY : "Optional custom placement key"}
        />
        {isVenueLeaderboardSelection ? (
          <p className="mt-1 text-xs text-slate-500">
            This value is auto-set for venue leaderboard inline placements.
          </p>
        ) : null}
      </div>

      {isRoundEndTrivia ? (
        <>
          <div>
            <label className={adminLabel}>Round Number</label>
            <input
              type="number"
              min={1}
              max={24}
              value={draft.roundNumber}
              onChange={(event) => patch({ roundNumber: event.target.value })}
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="e.g. 1, 3, 5"
            />
          </div>
          <div>
            <label className={adminLabel}>Queue After Round (Optional)</label>
            <input
              type="number"
              min={1}
              max={24}
              value={draft.cycleAfterRound}
              onChange={(event) => patch({ cycleAfterRound: event.target.value })}
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="e.g. 8"
            />
            <p className="mt-1 text-xs text-slate-500">Set this to configure a cycle start point (for example: after round 8).</p>
          </div>
        </>
      ) : null}

      <div>
        <label className={adminLabel}>
          Sequence Index{isVenueLeaderboardSelection ? " *" : ""}
        </label>
        {isVenueLeaderboardSelection ? (
          <>
            <select
              value={draft.sequenceIndex}
              onChange={(event) => {
                setDidAutoSetLeaderboardSequenceIndex(false);
                patch({ sequenceIndex: event.target.value });
              }}
              disabled={disabled}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">Select sequence index</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
            {!hasValidLeaderboardSequence ? (
              <p className="mt-1 text-xs text-red-600">Leaderboard slots require a Sequence Index (1-5).</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Leaderboard slots require a Sequence Index (1-5).</p>
            )}
          </>
        ) : (
          <input
            type="number"
            min={1}
            value={draft.sequenceIndex}
            onChange={(event) => patch({ sequenceIndex: event.target.value })}
            disabled={disabled}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            placeholder="Used for inline ordering"
          />
        )}
      </div>
      <div>
        <label className={adminLabel}>Priority</label>
        <input
          type="number"
          min={0}
          value={draft.priority}
          onChange={(event) => patch({ priority: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <div>
        <label className={adminLabel}>Image URL *</label>
        <input
          value={draft.imageUrl}
          onChange={(event) => patch({ imageUrl: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>
      <div>
        <label className={adminLabel}>Click URL *</label>
        <input
          value={draft.clickUrl}
          onChange={(event) => patch({ clickUrl: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <div className="md:col-span-2">
        <label className={adminLabel}>Alt Text *</label>
        <input
          value={draft.altText}
          onChange={(event) => patch({ altText: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <div>
        <label className={adminLabel}>Width</label>
        <input
          type="number"
          min={1}
          value={draft.width}
          onChange={(event) => patch({ width: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>
      <div>
        <label className={adminLabel}>Height</label>
        <input
          type="number"
          min={1}
          value={draft.height}
          onChange={(event) => patch({ height: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
        <p className="mt-1 text-xs text-slate-500">
          Recommended: popup 540x960, banner 320x50, inline 300x250.
        </p>
      </div>

      <div>
        <label className={adminLabel}>Frequency Interval</label>
        <input
          type="number"
          min={1}
          value={draft.frequencyInterval}
          onChange={(event) => patch({ frequencyInterval: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>
      <div>
        <label className={adminLabel}>Dismiss Delay (s)</label>
        <input
          type="number"
          min={0}
          value={draft.dismissDelaySeconds}
          onChange={(event) => patch({ dismissDelaySeconds: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <div>
        <label className={adminLabel}>Popup Cooldown (s)</label>
        <input
          type="number"
          min={0}
          value={draft.popupCooldownSeconds}
          onChange={(event) => patch({ popupCooldownSeconds: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>
      <div>
        <label className={adminLabel}>Start Date *</label>
        <input
          type="date"
          value={draft.startDate}
          onChange={(event) => patch({ startDate: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <div>
        <label className={adminLabel}>End Date</label>
        <input
          type="date"
          value={draft.endDate}
          onChange={(event) => patch({ endDate: event.target.value })}
          disabled={disabled}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      <div className="md:col-span-2 space-y-2">
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
        {draft.isPlaceholder && onApplyPlaceholderToAllInlineSlots ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                void onApplyPlaceholderToAllInlineSlots();
              }}
              disabled={disabled || applyingPlaceholderToAllInlineSlots}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applyingPlaceholderToAllInlineSlots
                ? "Applying Placeholder..."
                : "Apply this ad as placeholder across ALL inline slots"}
            </button>
            {placeholderApplySummary ? (
              <p className="text-xs text-slate-600">{placeholderApplySummary}</p>
            ) : null}
          </div>
        ) : null}
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
            <label className={adminLabel}>Specific Venues</label>
            <input
              value={venueSearch}
              onChange={(event) => setVenueSearch(event.target.value)}
              disabled={disabled}
              className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="Search venues by name/city/state"
            />
            <select
              multiple
              value={draft.venueIds}
              onChange={handleVenueMultiSelect}
              disabled={disabled}
              className="h-28 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
            <label className={adminLabel}>Cities</label>
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
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
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
            <label className={adminLabel}>States</label>
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
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
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
            <label className={adminLabel}>Zip Codes</label>
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
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
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
            <label className={adminLabel}>Regions</label>
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
                  className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
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
