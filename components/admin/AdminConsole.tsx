"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ensureAnonymousSession } from "@/lib/auth";
import { ADMIN_SECTION_OPTIONS, type AdminSection } from "@/components/admin/adminSections";
import { supabase } from "@/lib/supabase";
import { deriveSlotFromPlacement } from "@/lib/adPlacements";
import type {
  AdDisplayTrigger,
  AdPageKey,
  AdSlot,
  AdType,
  Advertisement,
  CampaignRecurringType,
  TriviaQuestion,
  Venue,
} from "@/types";
import { getVenueDisplayName } from "@/lib/venueDisplay";

const AD_PAGE_KEYS: Array<Exclude<AdPageKey, "global">> = ["join", "venue", "trivia", "sports-bingo", "pickem", "fantasy"];
const AD_PAGE_LABEL: Record<AdPageKey, string> = {
  global: "Global",
  join: "Join",
  venue: "Leaderboard",
  trivia: "Trivia",
  "sports-bingo": "Sports Bingo",
  pickem: "Pick 'Em",
  fantasy: "Fantasy",
};
const AD_TYPE_LABEL: Record<AdType, string> = {
  popup: "Pop Up",
  banner: "Banner",
  inline: "Inline",
};
const AD_TRIGGER_LABEL: Record<AdDisplayTrigger, string> = {
  "on-load": "On Landing",
  "on-scroll": "On Scroll",
  "round-end": "Round End",
};
const FORM_SELECT_CLASS = "rounded-md border border-slate-300 px-3 py-2.5 text-base leading-6";
const FORM_LABEL_CLASS = "block text-xs font-medium uppercase tracking-wide text-slate-600";
const VENUE_INLINE_VARIANTS = [
  { value: 1, label: "Variant 1 (ranks 1-10)" },
  { value: 2, label: "Variant 2 (ranks 11-20)" },
  { value: 3, label: "Variant 3 (ranks 21-30)" },
  { value: 4, label: "Variant 4 (ranks 31-40)" },
  { value: 5, label: "Variant 5 (ranks 41-50)" },
] as const;
const AD_TYPE_ORDER: AdType[] = ["popup", "banner", "inline"];
const CHALLENGE_GAME_TYPES = ["pickem", "fantasy", "trivia", "bingo"] as const;
const CHALLENGE_ACTIVE_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const CHALLENGE_RECURRING_OPTIONS: CampaignRecurringType[] = ["none", "daily", "weekly", "monthly", "yearly"];

type AdInventorySlot = {
  id: string;
  pageKey: AdPageKey;
  adType: AdType;
  label: string;
  displayTrigger?: AdDisplayTrigger;
  placementKey?: string;
  roundNumber?: number;
  sequenceIndex?: number;
};

const AD_INVENTORY_SLOTS: Record<Exclude<AdPageKey, "global">, AdInventorySlot[]> = {
  join: [
    { id: "join-popup-entry", pageKey: "join", adType: "popup", label: "Popup on Landing", displayTrigger: "on-load" },
    { id: "join-banner-mobile", pageKey: "join", adType: "banner", label: "Mobile Banner (Adhesion)", displayTrigger: "on-load" },
    { id: "join-inline-main", pageKey: "join", adType: "inline", label: "Inline Join Slot", displayTrigger: "on-load" },
  ],
  venue: [
    { id: "venue-popup-entry", pageKey: "venue", adType: "popup", label: "Popup on Landing", displayTrigger: "on-load" },
    { id: "venue-popup-scroll", pageKey: "venue", adType: "popup", label: "Popup on Scroll", displayTrigger: "on-scroll" },
    { id: "venue-banner-mobile", pageKey: "venue", adType: "banner", label: "Mobile Banner (Adhesion)", displayTrigger: "on-load" },
    ...VENUE_INLINE_VARIANTS.map((variant) => ({
      id: `venue-inline-v${variant.value}`,
      pageKey: "venue" as const,
      adType: "inline" as const,
      label: `Leaderboard Inline Variant ${variant.value}`,
      displayTrigger: "on-load" as const,
      placementKey: "venue-leaderboard-inline",
      sequenceIndex: variant.value,
    })),
  ],
  trivia: [
    { id: "trivia-popup-entry", pageKey: "trivia", adType: "popup", label: "Popup on Landing", displayTrigger: "on-load" },
    { id: "trivia-popup-round-1", pageKey: "trivia", adType: "popup", label: "Popup Round End (Round 1)", displayTrigger: "round-end", roundNumber: 1 },
    { id: "trivia-popup-round-2", pageKey: "trivia", adType: "popup", label: "Popup Round End (Round 2)", displayTrigger: "round-end", roundNumber: 2 },
    { id: "trivia-popup-round-3", pageKey: "trivia", adType: "popup", label: "Popup Round End (Round 3)", displayTrigger: "round-end", roundNumber: 3 },
    { id: "trivia-banner-mobile", pageKey: "trivia", adType: "banner", label: "Mobile Banner (Adhesion)", displayTrigger: "on-load" },
  ],
  "sports-bingo": [
    { id: "bingo-popup-entry", pageKey: "sports-bingo", adType: "popup", label: "Popup on Landing", displayTrigger: "on-load" },
    { id: "bingo-popup-scroll", pageKey: "sports-bingo", adType: "popup", label: "Popup on Scroll", displayTrigger: "on-scroll" },
    { id: "bingo-banner-mobile", pageKey: "sports-bingo", adType: "banner", label: "Mobile Banner (Adhesion)", displayTrigger: "on-load" },
    {
      id: "bingo-inline-active-home",
      pageKey: "sports-bingo",
      adType: "inline",
      label: "Inline Bingo Slot (Active Card)",
      displayTrigger: "on-load",
      placementKey: "bingo-home-active-inline",
    },
    {
      id: "bingo-inline-final-home",
      pageKey: "sports-bingo",
      adType: "inline",
      label: "Inline Bingo Slot (Final Cards)",
      displayTrigger: "on-load",
      placementKey: "bingo-home-final-inline",
    },
  ],
  pickem: [
    { id: "pickem-popup-entry", pageKey: "pickem", adType: "popup", label: "Popup on Landing", displayTrigger: "on-load" },
    { id: "pickem-popup-scroll", pageKey: "pickem", adType: "popup", label: "Popup on Scroll", displayTrigger: "on-scroll" },
    { id: "pickem-banner-mobile", pageKey: "pickem", adType: "banner", label: "Mobile Banner (Adhesion)", displayTrigger: "on-load" },
    { id: "pickem-inline-breaks", pageKey: "pickem", adType: "inline", label: "Inline Pick 'Em Slot", displayTrigger: "on-scroll", placementKey: "pickem-inline" },
  ],
  fantasy: [
    { id: "fantasy-popup-entry", pageKey: "fantasy", adType: "popup", label: "Popup on Landing", displayTrigger: "on-load" },
    { id: "fantasy-popup-scroll", pageKey: "fantasy", adType: "popup", label: "Popup on Scroll", displayTrigger: "on-scroll" },
    { id: "fantasy-banner-mobile", pageKey: "fantasy", adType: "banner", label: "Mobile Banner (Adhesion)", displayTrigger: "on-load" },
    { id: "fantasy-inline-breaks", pageKey: "fantasy", adType: "inline", label: "Inline Fantasy Slot", displayTrigger: "on-load", placementKey: "fantasy-inline" },
  ],
};

function isAdLiveNow(item: Advertisement, nowMs: number): boolean {
  if (!item.active) {
    return false;
  }

  const startMs = new Date(item.startDate).getTime();
  if (Number.isFinite(startMs) && startMs > nowMs) {
    return false;
  }

  if (item.endDate) {
    const endMs = new Date(item.endDate).getTime();
    if (Number.isFinite(endMs) && endMs < nowMs) {
      return false;
    }
  }

  return true;
}

function matchesInventorySlot(ad: Advertisement, slot: AdInventorySlot): boolean {
  if (ad.pageKey !== slot.pageKey || ad.adType !== slot.adType) {
    return false;
  }
  if (slot.displayTrigger && ad.displayTrigger !== slot.displayTrigger) {
    return false;
  }
  if (slot.placementKey && ad.placementKey !== slot.placementKey) {
    return false;
  }
  if (Number.isFinite(slot.roundNumber) && Number(ad.roundNumber) !== Number(slot.roundNumber)) {
    return false;
  }
  if (Number.isFinite(slot.sequenceIndex) && Number(ad.sequenceIndex) !== Number(slot.sequenceIndex)) {
    return false;
  }
  return true;
}

function isAdTargetingVenue(ad: Advertisement, venueId: string): boolean {
  if (ad.targetAllVenues) {
    return true;
  }
  if (!venueId) {
    return true;
  }
  const targetedVenueIds = ad.venueIds && ad.venueIds.length > 0 ? ad.venueIds : ad.venueId ? [ad.venueId] : [];
  if (targetedVenueIds.length === 0) {
    return true;
  }
  return targetedVenueIds.includes(venueId);
}

function getAdTypesForPage(pageKey: AdPageKey): AdType[] {
  if (pageKey === "trivia") {
    return ["popup", "banner"];
  }
  return ["popup", "banner", "inline"];
}

function getTriggersForPlacement(pageKey: AdPageKey, adType: AdType): AdDisplayTrigger[] {
  if (pageKey === "trivia") {
    return ["on-load", "round-end"];
  }
  if (pageKey === "pickem") {
    if (adType === "inline") {
      return ["on-scroll"];
    }
    return ["on-load", "on-scroll"];
  }
  if (pageKey === "fantasy") {
    if (adType === "inline") {
      return ["on-load"];
    }
    return ["on-load", "on-scroll"];
  }
  return ["on-load"];
}
const AD_SLOT_DEFAULT_SIZE: Record<AdSlot, { width: number; height: number }> = {
  header: { width: 728, height: 90 },
  "inline-content": { width: 300, height: 250 },
  sidebar: { width: 300, height: 600 },
  "mid-content": { width: 728, height: 90 },
  "leaderboard-sidebar": { width: 300, height: 250 },
  footer: { width: 728, height: 90 },
  "mobile-adhesion": { width: 320, height: 50 },
  "popup-on-entry": { width: 1080, height: 1920 },
  "popup-on-scroll": { width: 1080, height: 1920 },
};
const ADDRESS_LOOKUP_DEBOUNCE_MS = 250;
const MAX_AD_IMAGE_BYTES = 300 * 1024;
const AD_STATIC_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_CHALLENGE_IMAGE_BYTES = 1024 * 1024;
const CHALLENGE_IMAGE_MIME_TYPES = new Set(["image/png", "image/webp", "image/svg+xml"]);

function formatDateTimeLocal(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function isoToDateTimeLocal(isoValue: string): string {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return formatDateTimeLocal(date);
}

function getPopupImageFitMessage(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "";
  }

  const targetRatio = 9 / 16;
  const ratio = width / height;
  const delta = Math.abs(ratio - targetRatio) / targetRatio;

  if (delta <= 0.02) {
    return "9:16 detected. Perfect popup fit.";
  }
  if (delta <= 0.08) {
    return "Near 9:16. Popup will auto-fit with minimal padding.";
  }
  return "Not 9:16. Popup will still auto-fit, with extra padding.";
}

function getRecommendedSlotSize(slot: AdSlot): { width: number; height: number } {
  return AD_SLOT_DEFAULT_SIZE[slot] ?? { width: 728, height: 90 };
}

function toggleVenueSelection(current: string[], venueId: string): string[] {
  if (!venueId) {
    return current;
  }
  if (current.includes(venueId)) {
    return current.filter((id) => id !== venueId);
  }
  return [...current, venueId];
}

function parseTargetList(value: string): string[] {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

type LoadState = "idle" | "loading" | "error";
type AdminAdsDebugSnapshot = {
  generatedAt: string;
  windowHours: number;
  windowStart: string;
  totalAds: number;
  activeAds: number;
  totalImpressions: number;
  totalClicks: number;
  overallCtr: number;
  windowImpressions: number;
  windowClicks: number;
  windowCtr: number;
  slotCoverage: Array<{ slot: AdSlot; hasActiveAd: boolean; activeCount: number }>;
  topByImpressions: Advertisement[];
  topByClicks: Advertisement[];
  topByCtr: Advertisement[];
  topByWindowImpressions: Advertisement[];
  topByWindowClicks: Advertisement[];
  topByWindowCtr: Advertisement[];
  windowMetricsByAd: Record<string, { impressions: number; clicks: number; ctr: number }>;
};
type AdminPendingPredictionSummary = {
  predictionId: string;
  totalPicks: number;
  latestPickAt: string;
  outcomes: Array<{ outcomeId: string; outcomeTitle: string; pickCount: number }>;
};
type AdminChallengeCampaign = {
  id: string;
  createdAt: string;
  name: string;
  imageUrl?: string;
  imageScale?: number;
  imageFocusX?: number;
  imageFocusY?: number;
  imageFit?: "cover" | "contain";
  rules: string;
  venueIds: string[];
  activeDays: string[];
  startTime?: string;
  endTime?: string;
  endDate?: string;
  gameTypes: string[];
  pointMultiplier: number;
  pointsRequiredToWin: number;
  recurringType: CampaignRecurringType;
  winnerUserId?: string | null;
  winnerUsername?: string | null;
  isActive: boolean;
};
type AdminChallengeProgress = {
  id: string;
  challengeId: string;
  userId: string;
  venueId: string;
  pointsEarned: number;
  updatedAt: string;
};
type AdminVenueUser = {
  id: string;
  username: string;
  venueId: string;
  points: number;
  isAdmin: boolean;
  createdAt: string;
};
type AdminCredentials = {
  username: string;
  password: string;
};
type AdminAddressSuggestion = {
  label: string;
  latitude: number;
  longitude: number;
};
type AdminLiveShowdownSchedule = {
  id: string;
  title: string;
  startTime: string;
  timezone: string;
  numRounds: number;
  venueId: string | null;
  createdAt: string;
  updatedAt: string;
};
type AdminConsoleProps = {
  venues: Venue[];
  mode?: "dashboard" | "section";
  initialSection?: AdminSection;
};

export function AdminConsole({ venues, mode = "dashboard", initialSection }: AdminConsoleProps) {
  const router = useRouter();
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adminCredentials, setAdminCredentials] = useState<AdminCredentials | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection ?? "venue-users");
  const [availableVenues, setAvailableVenues] = useState<Venue[]>(venues);
  const [adsWindowHours, setAdsWindowHours] = useState(24);
  const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [adsDebug, setAdsDebug] = useState<AdminAdsDebugSnapshot | null>(null);
  const [pendingPredictions, setPendingPredictions] = useState<AdminPendingPredictionSummary[]>([]);
  const [challengeCampaigns, setChallengeCampaigns] = useState<AdminChallengeCampaign[]>([]);
  const [challengeProgress, setChallengeProgress] = useState<AdminChallengeProgress[]>([]);
  const [selectedChallengeCampaignId, setSelectedChallengeCampaignId] = useState("");
  const [editingChallengeCampaignId, setEditingChallengeCampaignId] = useState<string | null>(null);
  const [selectedVenueUserId, setSelectedVenueUserId] = useState(() => venues[0]?.id ?? "");
  const [venueUsers, setVenueUsers] = useState<AdminVenueUser[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserUsername, setEditUserUsername] = useState("");
  const [editUserPoints, setEditUserPoints] = useState(0);
  const [adminLoginUsername, setAdminLoginUsername] = useState("");
  const [adminLoginPassword, setAdminLoginPassword] = useState("");
  const [bootstrappingAdmin, setBootstrappingAdmin] = useState(false);
  const [adminLoginMessage, setAdminLoginMessage] = useState("");
  const [settlingPredictionId, setSettlingPredictionId] = useState<string | null>(null);
  const [autoSettlingPredictions, setAutoSettlingPredictions] = useState(false);
  const [autoSettleMessage, setAutoSettleMessage] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingAdId, setEditingAdId] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("Option A, Option B");
  const [correctAnswer, setCorrectAnswer] = useState(0);
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");

  const [pageKey, setPageKey] = useState<AdPageKey>("venue");
  const [adType, setAdType] = useState<AdType>("popup");
  const [displayTrigger, setDisplayTrigger] = useState<AdDisplayTrigger>("on-load");
  const [placementKey, setPlacementKey] = useState("default");
  const [roundNumber, setRoundNumber] = useState<number | "all">("all");
  const [sequenceIndex, setSequenceIndex] = useState(1);
  const [slot, setSlot] = useState<AdSlot>(() => deriveSlotFromPlacement({ adType: "popup", displayTrigger: "on-load" }));
  const [venueIds, setVenueIds] = useState<string[]>([]);
  const [targetAllVenues, setTargetAllVenues] = useState(true);
  const [targetCitiesText, setTargetCitiesText] = useState("");
  const [targetZipCodesText, setTargetZipCodesText] = useState("");
  const [targetCountiesText, setTargetCountiesText] = useState("");
  const [targetStatesText, setTargetStatesText] = useState("");
  const [targetRegionsText, setTargetRegionsText] = useState("");
  const [advertiserName, setAdvertiserName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [adImageFile, setAdImageFile] = useState<File | null>(null);
  const [adImageDetails, setAdImageDetails] = useState("");
  const [isUploadingAdImage, setIsUploadingAdImage] = useState(false);
  const [clickUrl, setClickUrl] = useState("");
  const [altText, setAltText] = useState("");
  const [width, setWidth] = useState(728);
  const [height, setHeight] = useState(90);
  const [frequencyInterval, setFrequencyInterval] = useState(1);
  const [isPlaceholderAd, setIsPlaceholderAd] = useState(false);
  const [venueSearch, setVenueSearch] = useState("");
  const [dismissDelaySeconds, setDismissDelaySeconds] = useState(3);
  const [popupCooldownSeconds, setPopupCooldownSeconds] = useState(180);
  const [active, setActive] = useState(true);
  const [startDate, setStartDate] = useState(() => formatDateTimeLocal(new Date()));
  const [endDate, setEndDate] = useState("");

  const [editQuestionText, setEditQuestionText] = useState("");
  const [editOptionsText, setEditOptionsText] = useState("");
  const [editCorrectAnswer, setEditCorrectAnswer] = useState(0);
  const [editCategory, setEditCategory] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("");

  const [editPageKey, setEditPageKey] = useState<AdPageKey>("venue");
  const [editAdType, setEditAdType] = useState<AdType>("popup");
  const [editDisplayTrigger, setEditDisplayTrigger] = useState<AdDisplayTrigger>("on-load");
  const [editPlacementKey, setEditPlacementKey] = useState("default");
  const [editRoundNumber, setEditRoundNumber] = useState<number | "all">("all");
  const [editSequenceIndex, setEditSequenceIndex] = useState(1);
  const [editSlot, setEditSlot] = useState<AdSlot>(() => deriveSlotFromPlacement({ adType: "popup", displayTrigger: "on-load" }));
  const [editVenueIds, setEditVenueIds] = useState<string[]>([]);
  const [editTargetAllVenues, setEditTargetAllVenues] = useState(true);
  const [editTargetCitiesText, setEditTargetCitiesText] = useState("");
  const [editTargetZipCodesText, setEditTargetZipCodesText] = useState("");
  const [editTargetCountiesText, setEditTargetCountiesText] = useState("");
  const [editTargetStatesText, setEditTargetStatesText] = useState("");
  const [editTargetRegionsText, setEditTargetRegionsText] = useState("");
  const [editAdvertiserName, setEditAdvertiserName] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editAdImageFile, setEditAdImageFile] = useState<File | null>(null);
  const [editAdImageDetails, setEditAdImageDetails] = useState("");
  const [isUploadingEditAdImage, setIsUploadingEditAdImage] = useState(false);
  const [editClickUrl, setEditClickUrl] = useState("");
  const [editAltText, setEditAltText] = useState("");
  const [editWidth, setEditWidth] = useState(728);
  const [editHeight, setEditHeight] = useState(90);
  const [editFrequencyInterval, setEditFrequencyInterval] = useState(1);
  const [editIsPlaceholderAd, setEditIsPlaceholderAd] = useState(false);
  const [editVenueSearch, setEditVenueSearch] = useState("");
  const [editDismissDelaySeconds, setEditDismissDelaySeconds] = useState(3);
  const [editPopupCooldownSeconds, setEditPopupCooldownSeconds] = useState(180);
  const [editActive, setEditActive] = useState(true);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [newVenueName, setNewVenueName] = useState("");
  const [newVenueAddress, setNewVenueAddress] = useState("");
  const [newVenueRadius, setNewVenueRadius] = useState(100);
  const [creatingVenue, setCreatingVenue] = useState(false);
  const [venueCreateMessage, setVenueCreateMessage] = useState("");
  const [selectedManagedVenueId, setSelectedManagedVenueId] = useState(() => venues[0]?.id ?? "");
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [editVenueName, setEditVenueName] = useState("");
  const [editVenueDisplayName, setEditVenueDisplayName] = useState("");
  const [editVenueLogoText, setEditVenueLogoText] = useState("");
  const [editVenueIconEmoji, setEditVenueIconEmoji] = useState("");
  const [editVenueAddress, setEditVenueAddress] = useState("");
  const [editVenueLatitude, setEditVenueLatitude] = useState("");
  const [editVenueLongitude, setEditVenueLongitude] = useState("");
  const [editVenueRadius, setEditVenueRadius] = useState(100);
  const [venueEditMessage, setVenueEditMessage] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<AdminAddressSuggestion[]>([]);
  const [isAddressLookupLoading, setIsAddressLookupLoading] = useState(false);
  const [selectedAddressSuggestion, setSelectedAddressSuggestion] = useState<AdminAddressSuggestion | null>(null);
  const [editAddressSuggestions, setEditAddressSuggestions] = useState<AdminAddressSuggestion[]>([]);
  const [isEditAddressLookupLoading, setIsEditAddressLookupLoading] = useState(false);
  const [adsCreateReturnSection, setAdsCreateReturnSection] = useState<AdminSection | null>(null);
  const [adsListReturnToBoard, setAdsListReturnToBoard] = useState(false);
  const [challengeName, setChallengeName] = useState("");
  const [challengeRules, setChallengeRules] = useState("");
  const [challengeImageUrl, setChallengeImageUrl] = useState("");
  const [challengeImageRemoved, setChallengeImageRemoved] = useState(false);
  const [challengeImageFile, setChallengeImageFile] = useState<File | null>(null);
  const [challengeImageDetails, setChallengeImageDetails] = useState("");
  const [challengeImagePreviewUrl, setChallengeImagePreviewUrl] = useState("");
  const [challengePreviewCheckerboard, setChallengePreviewCheckerboard] = useState(false);
  const [isChallengeDropActive, setIsChallengeDropActive] = useState(false);
  const [challengeImageScale, setChallengeImageScale] = useState(1);
  const [challengeImageFit, setChallengeImageFit] = useState<"cover" | "contain">("cover");
  const [isUploadingChallengeImage, setIsUploadingChallengeImage] = useState(false);
  const [challengeVenueIds, setChallengeVenueIds] = useState<string[]>([]);
  const [challengeVenueSearch, setChallengeVenueSearch] = useState("");
  const [challengeActiveDays, setChallengeActiveDays] = useState<string[]>([]);
  const [challengeStartTime, setChallengeStartTime] = useState("");
  const [challengeEndTime, setChallengeEndTime] = useState("");
  const [challengeEndDate, setChallengeEndDate] = useState("");
  const [challengeGameTypes, setChallengeGameTypes] = useState<string[]>(["pickem", "fantasy", "trivia", "bingo"]);
  const [challengePointMultiplier, setChallengePointMultiplier] = useState("1");
  const [challengePointsRequired, setChallengePointsRequired] = useState("100");
  const [challengeRecurringType, setChallengeRecurringType] = useState<CampaignRecurringType>("none");
  const [challengeIsActive, setChallengeIsActive] = useState(true);
  const [challengeFormMessage, setChallengeFormMessage] = useState("");
  const [liveShowdownSchedules, setLiveShowdownSchedules] = useState<AdminLiveShowdownSchedule[]>([]);
  const [liveTriviaTitle, setLiveTriviaTitle] = useState("");
  const [liveTriviaTargetDate, setLiveTriviaTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [liveTriviaStartTime, setLiveTriviaStartTime] = useState("19:00");
  const [liveTriviaTimezone, setLiveTriviaTimezone] = useState("America/New_York");
  const [liveTriviaNumRounds, setLiveTriviaNumRounds] = useState("3");
  const [liveTriviaVenueId, setLiveTriviaVenueId] = useState(() => venues[0]?.id ?? "");
  const [liveTriviaMessage, setLiveTriviaMessage] = useState("");
  const [creatingLiveTrivia, setCreatingLiveTrivia] = useState(false);
  const [devControlBusyScheduleId, setDevControlBusyScheduleId] = useState<string | null>(null);
  const addressSuggestionsCacheRef = useRef<Map<string, AdminAddressSuggestion[]>>(new Map());
  const challengePreviewResizeRef = useRef<{ active: boolean; startX: number; startY: number; startScale: number }>({
    active: false,
    startX: 0,
    startY: 0,
    startScale: 1,
  });
  const addressLookupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressLookupRequestId = useRef(0);
  const editAddressLookupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editAddressLookupRequestId = useRef(0);

  const parsedOptions = useMemo(
    () => optionsText.split(",").map((item) => item.trim()).filter(Boolean),
    [optionsText]
  );
  const parsedEditOptions = useMemo(
    () => editOptionsText.split(",").map((item) => item.trim()).filter(Boolean),
    [editOptionsText]
  );
  const selectedChallengeCampaign = useMemo(
    () => challengeCampaigns.find((item) => item.id === selectedChallengeCampaignId) ?? null,
    [challengeCampaigns, selectedChallengeCampaignId]
  );

  const resetChallengeForm = useCallback(() => {
    setEditingChallengeCampaignId(null);
    setChallengeName("");
    setChallengeRules("");
    setChallengeImageUrl("");
    setChallengeImageRemoved(false);
    setChallengeImageFile(null);
    setChallengeImageDetails("");
    setChallengeImagePreviewUrl("");
    setChallengePreviewCheckerboard(false);
    setIsChallengeDropActive(false);
    setChallengeImageScale(1);
    setChallengeImageFit("cover");
    setIsUploadingChallengeImage(false);
    setChallengeVenueIds([]);
    setChallengeVenueSearch("");
    setChallengeActiveDays([]);
    setChallengeStartTime("");
    setChallengeEndTime("");
    setChallengeEndDate("");
    setChallengeGameTypes(["pickem", "fantasy", "trivia", "bingo"]);
    setChallengePointMultiplier("1");
    setChallengePointsRequired("100");
    setChallengeRecurringType("none");
    setChallengeIsActive(true);
    setChallengeFormMessage("");
  }, []);

  const availableAdTypes = useMemo(() => getAdTypesForPage(pageKey), [pageKey]);
  const availableTriggers = useMemo(() => getTriggersForPlacement(pageKey, adType), [pageKey, adType]);
  const availableEditAdTypes = useMemo(() => getAdTypesForPage(editPageKey), [editPageKey]);
  const availableEditTriggers = useMemo(
    () => getTriggersForPlacement(editPageKey, editAdType),
    [editPageKey, editAdType]
  );
  const liveAdPages = useMemo(() => {
    const nowMs = Date.now();
    const liveAds = ads.filter((item) => isAdLiveNow(item, nowMs));

    return AD_PAGE_KEYS.map((page) => {
      const pageLiveAds = liveAds.filter(
        (item) => item.pageKey === page && isAdTargetingVenue(item, selectedManagedVenueId)
      );
      const inventorySlots = AD_INVENTORY_SLOTS[page] ?? [];
      const slotsWithAds = inventorySlots.map((slot) => ({
        slot,
        ads: pageLiveAds.filter((item) => matchesInventorySlot(item, slot)),
      }));
      const slottedIds = new Set(slotsWithAds.flatMap((entry) => entry.ads.map((item) => item.id)));
      const unmatchedAds = pageLiveAds.filter((item) => !slottedIds.has(item.id));

      return {
        page,
        pageLiveAds,
        slotsWithAds,
        unmatchedAds,
      };
    });
  }, [ads, selectedManagedVenueId]);
  const venueNameById = useMemo(() => {
    return new Map(availableVenues.map((venue) => [venue.id, getVenueDisplayName(venue)]));
  }, [availableVenues]);
  const isDevTestingControlsEnabled = process.env.NODE_ENV !== "production";

  useEffect(() => {
    if (!availableAdTypes.includes(adType)) {
      setAdType(availableAdTypes[0] ?? "popup");
    }
  }, [availableAdTypes, adType]);

  useEffect(() => {
    if (!availableTriggers.includes(displayTrigger)) {
      setDisplayTrigger(availableTriggers[0] ?? "on-load");
    }
  }, [availableTriggers, displayTrigger]);

  useEffect(() => {
    if (!availableEditAdTypes.includes(editAdType)) {
      setEditAdType(availableEditAdTypes[0] ?? "popup");
    }
  }, [availableEditAdTypes, editAdType]);

  useEffect(() => {
    if (!availableEditTriggers.includes(editDisplayTrigger)) {
      setEditDisplayTrigger(availableEditTriggers[0] ?? "on-load");
    }
  }, [availableEditTriggers, editDisplayTrigger]);

  useEffect(() => {
    setSlot(deriveSlotFromPlacement({ adType, displayTrigger }));
  }, [adType, displayTrigger]);

  useEffect(() => {
    setEditSlot(deriveSlotFromPlacement({ adType: editAdType, displayTrigger: editDisplayTrigger }));
  }, [editAdType, editDisplayTrigger]);

  useEffect(() => {
    const recommended = getRecommendedSlotSize(slot);
    setWidth(recommended.width);
    setHeight(recommended.height);
  }, [slot]);

  useEffect(() => {
    const recommended = getRecommendedSlotSize(editSlot);
    setEditWidth(recommended.width);
    setEditHeight(recommended.height);
  }, [editSlot]);

  useEffect(() => {
    if (adType === "inline" && pageKey === "venue") {
      setPlacementKey("venue-leaderboard-inline");
      return;
    }
    if ((adType === "popup" || adType === "banner") && pageKey === "trivia" && displayTrigger === "round-end") {
      setPlacementKey("trivia-round-end");
      if (roundNumber === "all") {
        setRoundNumber(1);
      }
      return;
    }
    if (adType === "inline" && pageKey === "pickem") {
      setPlacementKey("pickem-inline");
      return;
    }
    if (adType === "popup" && pageKey === "pickem" && displayTrigger === "on-scroll") {
      setPlacementKey("pickem-popup-scroll");
      return;
    }
    if (adType === "banner" && pageKey === "pickem" && displayTrigger === "on-scroll") {
      setPlacementKey("pickem-banner-scroll");
      return;
    }
    if (adType === "inline" && pageKey === "fantasy") {
      setPlacementKey("fantasy-inline");
      return;
    }
    if (adType === "popup" && pageKey === "fantasy" && displayTrigger === "on-scroll") {
      setPlacementKey("fantasy-popup-scroll");
      return;
    }
    if (adType === "banner" && pageKey === "fantasy" && displayTrigger === "on-scroll") {
      setPlacementKey("fantasy-banner-scroll");
      return;
    }
    if (!placementKey.trim()) {
      setPlacementKey("default");
    }
  }, [adType, pageKey, displayTrigger, placementKey, roundNumber]);

  useEffect(() => {
    if (editAdType === "inline" && editPageKey === "venue") {
      setEditPlacementKey("venue-leaderboard-inline");
      return;
    }
    if ((editAdType === "popup" || editAdType === "banner") && editPageKey === "trivia" && editDisplayTrigger === "round-end") {
      setEditPlacementKey("trivia-round-end");
      if (editRoundNumber === "all") {
        setEditRoundNumber(1);
      }
      return;
    }
    if (editAdType === "inline" && editPageKey === "pickem") {
      setEditPlacementKey("pickem-inline");
      return;
    }
    if (editAdType === "popup" && editPageKey === "pickem" && editDisplayTrigger === "on-scroll") {
      setEditPlacementKey("pickem-popup-scroll");
      return;
    }
    if (editAdType === "banner" && editPageKey === "pickem" && editDisplayTrigger === "on-scroll") {
      setEditPlacementKey("pickem-banner-scroll");
      return;
    }
    if (editAdType === "inline" && editPageKey === "fantasy") {
      setEditPlacementKey("fantasy-inline");
      return;
    }
    if (editAdType === "popup" && editPageKey === "fantasy" && editDisplayTrigger === "on-scroll") {
      setEditPlacementKey("fantasy-popup-scroll");
      return;
    }
    if (editAdType === "banner" && editPageKey === "fantasy" && editDisplayTrigger === "on-scroll") {
      setEditPlacementKey("fantasy-banner-scroll");
      return;
    }
    if (!editPlacementKey.trim()) {
      setEditPlacementKey("default");
    }
  }, [editAdType, editPageKey, editDisplayTrigger, editPlacementKey, editRoundNumber]);

  useEffect(() => {
    setAvailableVenues(venues);
  }, [venues]);

  useEffect(() => {
    return () => {
      if (addressLookupDebounceRef.current) {
        clearTimeout(addressLookupDebounceRef.current);
      }
      if (editAddressLookupDebounceRef.current) {
        clearTimeout(editAddressLookupDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (availableVenues.length === 0) {
      if (selectedVenueUserId) {
        setSelectedVenueUserId("");
      }
      return;
    }
    if (!availableVenues.some((venue) => venue.id === selectedVenueUserId)) {
      setSelectedVenueUserId(availableVenues[0].id);
    }
  }, [availableVenues, selectedVenueUserId]);

  useEffect(() => {
    if (availableVenues.length === 0) {
      if (selectedManagedVenueId) {
        setSelectedManagedVenueId("");
      }
      setEditingVenueId(null);
      return;
    }
    if (!availableVenues.some((venue) => venue.id === selectedManagedVenueId)) {
      setSelectedManagedVenueId(availableVenues[0].id);
    }
  }, [availableVenues, selectedManagedVenueId]);

  const adminFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    if (adminCredentials) {
      headers.set("x-admin-username", adminCredentials.username);
      headers.set("x-admin-password", adminCredentials.password);
    }

    return fetch(input, {
      ...init,
      headers,
    });
  }, [accessToken, adminCredentials]);

  const requestAddressSuggestions = useCallback(
    async (query: string) => {
      const safeQuery = query.trim().replace(/\s+/g, " ");
      if (safeQuery.length < 3) {
        return [] as AdminAddressSuggestion[];
      }

      const normalizedQuery = safeQuery.toLowerCase();
      const cachedSuggestions = addressSuggestionsCacheRef.current.get(normalizedQuery);
      if (cachedSuggestions) {
        return cachedSuggestions;
      }

      const response = await adminFetch(
        `/api/admin/places?q=${encodeURIComponent(safeQuery)}&limit=8&provider=google`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as {
        ok: boolean;
        suggestions?: AdminAddressSuggestion[];
        error?: string;
      };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Unable to load address suggestions.");
      }
      const suggestions = payload.suggestions ?? [];
      addressSuggestionsCacheRef.current.set(normalizedQuery, suggestions);
      return suggestions;
    },
    [adminFetch]
  );

  const loadAddressSuggestions = useCallback(
    async (query: string) => {
      const requestId = ++addressLookupRequestId.current;
      setIsAddressLookupLoading(true);
      try {
        const suggestions = await requestAddressSuggestions(query);
        if (requestId !== addressLookupRequestId.current) {
          return;
        }
        setAddressSuggestions(suggestions);
      } catch (error) {
        if (requestId !== addressLookupRequestId.current) {
          return;
        }
        setAddressSuggestions([]);
        setErrorMessage(error instanceof Error ? error.message : "Unable to load address suggestions.");
      } finally {
        if (requestId === addressLookupRequestId.current) {
          setIsAddressLookupLoading(false);
        }
      }
    },
    [requestAddressSuggestions]
  );

  const handleVenueAddressInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      const normalizedValue = nextValue.trim().replace(/\s+/g, " ");
      setNewVenueAddress(nextValue);
      setSelectedAddressSuggestion(null);
      setAddressSuggestions([]);
      setErrorMessage("");

      if (addressLookupDebounceRef.current) {
        clearTimeout(addressLookupDebounceRef.current);
      }

      if (normalizedValue.length < 3) {
        setIsAddressLookupLoading(false);
        setAddressSuggestions([]);
        return;
      }

      addressLookupDebounceRef.current = setTimeout(() => {
        void loadAddressSuggestions(normalizedValue);
      }, ADDRESS_LOOKUP_DEBOUNCE_MS);
    },
    [loadAddressSuggestions]
  );

  const pickAddressSuggestion = (suggestion: AdminAddressSuggestion) => {
    setNewVenueAddress(suggestion.label);
    setSelectedAddressSuggestion(suggestion);
    setAddressSuggestions([]);
    setIsAddressLookupLoading(false);
  };

  const loadEditAddressSuggestions = useCallback(
    async (query: string) => {
      const requestId = ++editAddressLookupRequestId.current;
      setIsEditAddressLookupLoading(true);
      try {
        const suggestions = await requestAddressSuggestions(query);
        if (requestId !== editAddressLookupRequestId.current) {
          return;
        }
        setEditAddressSuggestions(suggestions);
        if (suggestions.length > 0) {
          const topSuggestion = suggestions[0];
          setEditVenueLatitude(topSuggestion.latitude.toString());
          setEditVenueLongitude(topSuggestion.longitude.toString());
        }
      } catch (error) {
        if (requestId !== editAddressLookupRequestId.current) {
          return;
        }
        setEditAddressSuggestions([]);
        setErrorMessage(error instanceof Error ? error.message : "Unable to load address suggestions.");
      } finally {
        if (requestId === editAddressLookupRequestId.current) {
          setIsEditAddressLookupLoading(false);
        }
      }
    },
    [requestAddressSuggestions]
  );

  const handleEditVenueAddressInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      const normalizedValue = nextValue.trim().replace(/\s+/g, " ");
      setEditVenueAddress(nextValue);
      // Avoid submitting stale coordinates from the previous address.
      setEditVenueLatitude("");
      setEditVenueLongitude("");
      setEditAddressSuggestions([]);
      setErrorMessage("");

      if (editAddressLookupDebounceRef.current) {
        clearTimeout(editAddressLookupDebounceRef.current);
      }

      if (normalizedValue.length < 3) {
        setIsEditAddressLookupLoading(false);
        setEditAddressSuggestions([]);
        return;
      }

      editAddressLookupDebounceRef.current = setTimeout(() => {
        void loadEditAddressSuggestions(normalizedValue);
      }, ADDRESS_LOOKUP_DEBOUNCE_MS);
    },
    [loadEditAddressSuggestions]
  );

  const pickEditAddressSuggestion = (suggestion: AdminAddressSuggestion) => {
    setEditVenueAddress(suggestion.label);
    setEditVenueLatitude(suggestion.latitude.toString());
    setEditVenueLongitude(suggestion.longitude.toString());
    setEditAddressSuggestions([]);
    setIsEditAddressLookupLoading(false);
  };

  const getImageDimensions = useCallback(
    (file: File) =>
      new Promise<{ width: number; height: number }>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          const resolvedWidth = image.naturalWidth || image.width;
          const resolvedHeight = image.naturalHeight || image.height;
          URL.revokeObjectURL(objectUrl);
          if (!resolvedWidth || !resolvedHeight) {
            reject(new Error("Unable to read image dimensions."));
            return;
          }
          resolve({ width: resolvedWidth, height: resolvedHeight });
        };
        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Unable to load image preview."));
        };
        image.src = objectUrl;
      }),
    []
  );

  const uploadAdImageFile = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await adminFetch("/api/admin/ads/upload", {
      method: "POST",
      body: formData,
    });
    const payload = (await response.json()) as { ok: boolean; imageUrl?: string; error?: string };
    if (!payload.ok || !payload.imageUrl) {
      throw new Error(payload.error ?? "Failed to upload ad image.");
    }

    return payload.imageUrl;
  }, [adminFetch]);

  const uploadChallengeImageFile = useCallback(
    async (file: File): Promise<string> => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await adminFetch("/api/admin/challenges/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { ok: boolean; imageUrl?: string; error?: string };
      if (!payload.ok || !payload.imageUrl) {
        throw new Error(payload.error ?? "Failed to upload challenge image.");
      }
      return payload.imageUrl;
    },
    [adminFetch]
  );

  const handleAdImageSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0] ?? null;
      setErrorMessage("");
      setAdImageFile(null);
      setAdImageDetails("");
      setImageUrl("");

      if (!selectedFile) {
        return;
      }

      if (!AD_STATIC_IMAGE_MIME_TYPES.has(selectedFile.type)) {
        setErrorMessage("Only static JPG, PNG, or WebP files are allowed.");
        return;
      }

      if (selectedFile.size > MAX_AD_IMAGE_BYTES) {
        setErrorMessage("Image must be under 300KB.");
        return;
      }

      try {
        const dimensions = await getImageDimensions(selectedFile);
        setWidth(dimensions.width);
        setHeight(dimensions.height);
        setAdImageFile(selectedFile);
        setAdImageDetails(
          `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)}KB) - ${dimensions.width}x${dimensions.height} - ${getPopupImageFitMessage(dimensions.width, dimensions.height)}`
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to process selected image.");
      }
    },
    [getImageDimensions]
  );

  const handleEditAdImageSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0] ?? null;
      setErrorMessage("");
      setEditAdImageFile(null);
      setEditAdImageDetails("");

      if (!selectedFile) {
        return;
      }

      if (!AD_STATIC_IMAGE_MIME_TYPES.has(selectedFile.type)) {
        setErrorMessage("Only static JPG, PNG, or WebP files are allowed.");
        return;
      }

      if (selectedFile.size > MAX_AD_IMAGE_BYTES) {
        setErrorMessage("Image must be under 300KB.");
        return;
      }

      try {
        const dimensions = await getImageDimensions(selectedFile);
        setEditWidth(dimensions.width);
        setEditHeight(dimensions.height);
        setEditAdImageFile(selectedFile);
        setEditAdImageDetails(
          `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)}KB) - ${dimensions.width}x${dimensions.height} - ${getPopupImageFitMessage(dimensions.width, dimensions.height)}`
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to process selected image.");
      }
    },
    [getImageDimensions]
  );

  async function handleChallengeImageSelection(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null;
    acceptChallengeImageFile(selectedFile);
  }

  const acceptChallengeImageFile = useCallback((selectedFile: File | null) => {
    setErrorMessage("");
    setChallengeImageFile(null);
    setChallengeImageDetails("");
    setChallengeImagePreviewUrl("");
    setChallengeImageRemoved(false);
    if (!selectedFile) return;
    if (!CHALLENGE_IMAGE_MIME_TYPES.has(selectedFile.type)) {
      setErrorMessage("Challenge images must be PNG/WebP/SVG (JPEG is not supported for transparent icons).");
      return;
    }
    if (selectedFile.size <= 0) {
      setErrorMessage("Selected challenge image is empty.");
      return;
    }
    if (selectedFile.size > MAX_CHALLENGE_IMAGE_BYTES) {
      setErrorMessage("Challenge image must be under 1MB.");
      return;
    }
    setChallengeImageFile(selectedFile);
    setChallengeImageDetails(`${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)}KB) - ${selectedFile.type || "unknown type"}`);
    setChallengeImagePreviewUrl(URL.createObjectURL(selectedFile));
  }, []);

  useEffect(() => {
    return () => {
      if (challengeImagePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(challengeImagePreviewUrl);
      }
    };
  }, [challengeImagePreviewUrl]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!challengePreviewResizeRef.current.active) return;
      const delta = ((event.clientX - challengePreviewResizeRef.current.startX) + (event.clientY - challengePreviewResizeRef.current.startY)) / 280;
      const nextScale = Math.max(0.6, Math.min(2.5, Number((challengePreviewResizeRef.current.startScale + delta).toFixed(3))));
      setChallengeImageScale(nextScale);
    };
    const handleUp = () => {
      challengePreviewResizeRef.current.active = false;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  const loadAll = useCallback(async () => {
    setState("loading");
    setErrorMessage("");
    try {
      const [triviaResponse, adResponse, adsDebugResponse, pendingPredictionsResponse, challengeCampaignsResponse] = await Promise.all([
        adminFetch("/api/admin?resource=trivia", { cache: "no-store" }),
        adminFetch("/api/admin?resource=ads", { cache: "no-store" }),
        adminFetch(`/api/admin?resource=ads-debug&windowHours=${adsWindowHours}`, { cache: "no-store" }),
        adminFetch("/api/admin?resource=predictions-pending", { cache: "no-store" }),
        adminFetch("/api/admin?resource=challenge-campaigns&includeInactive=true&includeResolved=true", { cache: "no-store" }),
      ]);

      const triviaPayload = (await triviaResponse.json()) as {
        ok: boolean;
        items?: TriviaQuestion[];
        error?: string;
      };
      const adPayload = (await adResponse.json()) as {
        ok: boolean;
        items?: Advertisement[];
        error?: string;
      };
      const adsDebugPayload = (await adsDebugResponse.json()) as {
        ok: boolean;
        snapshot?: AdminAdsDebugSnapshot;
        error?: string;
      };
      const pendingPredictionsPayload = (await pendingPredictionsResponse.json()) as {
        ok: boolean;
        items?: AdminPendingPredictionSummary[];
        error?: string;
      };
      const challengeCampaignsPayload = (await challengeCampaignsResponse.json()) as {
        ok: boolean;
        items?: AdminChallengeCampaign[];
        error?: string;
      };

      if (!triviaPayload.ok) {
        throw new Error(triviaPayload.error ?? "Failed to load trivia.");
      }
      if (!adPayload.ok) {
        throw new Error(adPayload.error ?? "Failed to load ads.");
      }
      if (!adsDebugPayload.ok) {
        throw new Error(adsDebugPayload.error ?? "Failed to load ad debug snapshot.");
      }
      if (!pendingPredictionsPayload.ok) {
        throw new Error(pendingPredictionsPayload.error ?? "Failed to load pending predictions.");
      }
      if (!challengeCampaignsPayload.ok) {
        throw new Error(challengeCampaignsPayload.error ?? "Failed to load challenge campaigns.");
      }

      setQuestions(triviaPayload.items ?? []);
      setAds(adPayload.items ?? []);
      setAdsDebug(adsDebugPayload.snapshot ?? null);
      setPendingPredictions(pendingPredictionsPayload.items ?? []);
      const campaigns = challengeCampaignsPayload.items ?? [];
      setChallengeCampaigns(campaigns);
      setSelectedChallengeCampaignId((current) => current || campaigns[0]?.id || "");
      setState("idle");
    } catch (error) {
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to load admin data.");
    }
  }, [adminFetch, adsWindowHours]);

  const loadVenueUsers = useCallback(async () => {
    if (!selectedVenueUserId) {
      setVenueUsers([]);
      return;
    }

    try {
      const response = await adminFetch(
        `/api/admin/users?venueId=${encodeURIComponent(selectedVenueUserId)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as {
        ok: boolean;
        users?: AdminVenueUser[];
        error?: string;
      };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load venue users.");
      }
      setVenueUsers(payload.users ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load venue users.");
    }
  }, [adminFetch, selectedVenueUserId]);

  const loadChallengeProgress = useCallback(async () => {
    const challengeId = selectedChallengeCampaignId.trim();
    if (!challengeId) {
      setChallengeProgress([]);
      return;
    }
    try {
      const response = await adminFetch(
        `/api/admin?resource=challenge-campaign-progress&challengeId=${encodeURIComponent(challengeId)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as { ok: boolean; items?: AdminChallengeProgress[]; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load challenge progress.");
      }
      setChallengeProgress(payload.items ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load challenge progress.");
    }
  }, [adminFetch, selectedChallengeCampaignId]);

  const loadLiveShowdownSchedules = useCallback(async () => {
    try {
      const response = await adminFetch("/api/admin?resource=live-showdown-schedules&limit=50", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        ok: boolean;
        items?: AdminLiveShowdownSchedule[];
        error?: string;
      };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to load Live Trivia schedules.");
      }
      setLiveShowdownSchedules(payload.items ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load Live Trivia schedules.");
    }
  }, [adminFetch]);

  useEffect(() => {
    const init = async () => {
      try {
        await ensureAnonymousSession();
        const { data, error } = await supabase!.auth.getSession();
        if (error) {
          throw error;
        }

        const token = data.session?.access_token ?? "";
        setAccessToken(token);
      } catch (error) {
        // Admin credential login can still proceed even if anonymous auth is unavailable.
        setAccessToken("");
        setErrorMessage(
          error instanceof Error ? `${error.message} You can still use Admin Login.` : "You can still use Admin Login."
        );
      } finally {
        setAuthInitialized(true);
      }
    };

    void init();
  }, []);

  useEffect(() => {
    if (!authInitialized) {
      return;
    }
    void loadAll();
  }, [authInitialized, accessToken, adminCredentials, loadAll]);

  useEffect(() => {
    if (!authInitialized) {
      return;
    }
    void loadVenueUsers();
  }, [authInitialized, accessToken, adminCredentials, loadVenueUsers]);

  useEffect(() => {
    if (!authInitialized || activeSection !== "challenge-campaigns") {
      return;
    }
    void loadChallengeProgress();
  }, [activeSection, authInitialized, loadChallengeProgress]);

  useEffect(() => {
    if (!authInitialized) {
      return;
    }
    void loadLiveShowdownSchedules();
  }, [authInitialized, loadLiveShowdownSchedules]);

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);

  useEffect(() => {
    if (activeSection !== "ads-create" && adsCreateReturnSection) {
      setAdsCreateReturnSection(null);
    }
  }, [activeSection, adsCreateReturnSection]);

  const createTrivia = async () => {
    setErrorMessage("");
    try {
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "trivia",
          question,
          options: parsedOptions,
          correctAnswer,
          category,
          difficulty,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to create trivia question.");
      }
      setQuestion("");
      setOptionsText("Option A, Option B");
      setCorrectAnswer(0);
      setCategory("");
      setDifficulty("");
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create trivia question.");
    }
  };

  const createLiveShowdownSchedule = async () => {
    const title = liveTriviaTitle.trim();
    const targetDate = liveTriviaTargetDate.trim();
    const startTimeValue = liveTriviaStartTime.trim();
    const timezoneValue = liveTriviaTimezone.trim() || "America/New_York";
    const venueIdValue = liveTriviaVenueId.trim();
    const numRoundsValue = Math.max(1, Math.min(24, Math.floor(Number(liveTriviaNumRounds) || 1)));

    if (!title || !targetDate || !startTimeValue || !venueIdValue) {
      setLiveTriviaMessage("Title, date, start time, and venue are required.");
      return;
    }

    setCreatingLiveTrivia(true);
    setLiveTriviaMessage("");
    setErrorMessage("");
    try {
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "live-showdown-schedules",
          title,
          targetDate,
          startTime: startTimeValue,
          timezone: timezoneValue,
          numRounds: numRoundsValue,
          venueId: venueIdValue,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to create Live Trivia schedule.");
      }
      setLiveTriviaMessage("Live Trivia schedule created and question slots seeded.");
      setLiveTriviaTitle("");
      await loadLiveShowdownSchedules();
    } catch (error) {
      setLiveTriviaMessage(error instanceof Error ? error.message : "Failed to create Live Trivia schedule.");
    } finally {
      setCreatingLiveTrivia(false);
    }
  };

  const runLiveTriviaDevControl = async (
    scheduleId: string,
    resource: "live-showdown-force-next-phase" | "live-showdown-reset-answers",
    successMessage: string
  ) => {
    setDevControlBusyScheduleId(scheduleId);
    setLiveTriviaMessage("");
    setErrorMessage("");
    try {
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource,
          scheduleId,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Live Trivia developer control failed.");
      }
      setLiveTriviaMessage(successMessage);
      await loadLiveShowdownSchedules();
    } catch (error) {
      setLiveTriviaMessage(error instanceof Error ? error.message : "Live Trivia developer control failed.");
    } finally {
      setDevControlBusyScheduleId(null);
    }
  };

  const createAd = async () => {
    setErrorMessage("");
    setIsUploadingAdImage(true);
    try {
      if (!adImageFile) {
        throw new Error("Upload a static ad image (JPG, PNG, or WebP) under 300KB.");
      }
      const uploadedImageUrl = await uploadAdImageFile(adImageFile);
      setImageUrl(uploadedImageUrl);
      const computedRoundNumber =
        pageKey === "trivia" && displayTrigger === "round-end" && roundNumber !== "all" ? roundNumber : undefined;
      const computedSequenceIndex =
        adType === "inline" && pageKey === "venue"
          ? sequenceIndex
          : undefined;
      const computedDismissDelaySeconds = adType === "inline" ? undefined : dismissDelaySeconds;
      const computedPopupCooldownSeconds = adType === "inline" ? undefined : popupCooldownSeconds;
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "ads",
          slot,
          isPlaceholder: isPlaceholderAd,
          pageKey,
          adType,
          displayTrigger,
          placementKey: placementKey.trim() || undefined,
          roundNumber: computedRoundNumber,
          sequenceIndex: computedSequenceIndex,
          venueIds: venueIds.length > 0 ? venueIds : undefined,
          targetAllVenues,
          targetCities: parseTargetList(targetCitiesText),
          targetZipCodes: parseTargetList(targetZipCodesText),
          targetCounties: parseTargetList(targetCountiesText),
          targetStates: parseTargetList(targetStatesText),
          targetRegions: parseTargetList(targetRegionsText),
          advertiserName,
          imageUrl: uploadedImageUrl,
          clickUrl,
          altText,
          width,
          height,
          frequencyInterval,
          dismissDelaySeconds: computedDismissDelaySeconds,
          popupCooldownSeconds: computedPopupCooldownSeconds,
          active,
          startDate: new Date(startDate).toISOString(),
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to create ad.");
      }
      setAdvertiserName("");
      setImageUrl("");
      setAdImageFile(null);
      setAdImageDetails("");
      setClickUrl("");
      setAltText("");
      setWidth(728);
      setHeight(90);
      setFrequencyInterval(1);
      setIsPlaceholderAd(false);
      setDismissDelaySeconds(3);
      setPopupCooldownSeconds(180);
      setVenueIds([]);
      setTargetAllVenues(true);
      setTargetCitiesText("");
      setTargetZipCodesText("");
      setTargetCountiesText("");
      setTargetStatesText("");
      setTargetRegionsText("");
      setPageKey("venue");
      setAdType("popup");
      setDisplayTrigger("on-load");
      setPlacementKey("default");
      setRoundNumber("all");
      setSequenceIndex(1);
      setActive(true);
      setEndDate("");
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create ad.");
    } finally {
      setIsUploadingAdImage(false);
    }
  };

  const createVenue = async () => {
    if (!newVenueName.trim() || !newVenueAddress.trim()) {
      setErrorMessage("Venue name and address are required.");
      return;
    }

    setErrorMessage("");
    setVenueCreateMessage("");
    setCreatingVenue(true);
    try {
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "venues",
          name: newVenueName.trim(),
          displayName: newVenueName.trim(),
          address: newVenueAddress.trim(),
          latitude: selectedAddressSuggestion?.latitude,
          longitude: selectedAddressSuggestion?.longitude,
          radius: newVenueRadius,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string; item?: Venue };
      if (!payload.ok || !payload.item) {
        throw new Error(payload.error ?? "Failed to create venue.");
      }

      setAvailableVenues((prev) =>
        [...prev.filter((venue) => venue.id !== payload.item!.id), payload.item!].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setSelectedVenueUserId(payload.item.id);
      setSelectedManagedVenueId(payload.item.id);
      setVenueCreateMessage(
        `Venue created: ${payload.item.name} (${payload.item.id}) at ${payload.item.latitude.toFixed(6)}, ${payload.item.longitude.toFixed(6)}. Address: ${payload.item.address ?? "n/a"}.`
      );
      setNewVenueName("");
      setNewVenueAddress("");
      setSelectedAddressSuggestion(null);
      setAddressSuggestions([]);
      setNewVenueRadius(100);
      setActiveSection("venue-users");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create venue.");
    } finally {
      setCreatingVenue(false);
    }
  };

  const beginEditChallengeCampaign = useCallback((campaign: AdminChallengeCampaign) => {
    setEditingChallengeCampaignId(campaign.id);
    setChallengeName(campaign.name ?? "");
    setChallengeRules(campaign.rules ?? "");
    setChallengeImageUrl(campaign.imageUrl ?? "");
    setChallengeImageRemoved(false);
    setChallengeImageFile(null);
    setChallengeImageDetails("");
    setChallengeImagePreviewUrl("");
    setChallengeImageScale(Number(campaign.imageScale ?? 1));
    setChallengeImageFit(campaign.imageFit === "contain" ? "contain" : "cover");
    setChallengeVenueIds(campaign.venueIds ?? []);
    setChallengeVenueSearch("");
    setChallengeActiveDays(campaign.activeDays ?? []);
    setChallengeStartTime(campaign.startTime?.slice(0, 5) ?? "");
    setChallengeEndTime(campaign.endTime?.slice(0, 5) ?? "");
    setChallengeEndDate(campaign.endDate ?? "");
    setChallengeGameTypes(campaign.gameTypes ?? ["pickem", "fantasy", "trivia", "bingo"]);
    setChallengePointMultiplier(String(campaign.pointMultiplier ?? 1));
    setChallengePointsRequired(String(campaign.pointsRequiredToWin ?? 100));
    setChallengeRecurringType(campaign.recurringType ?? "none");
    setChallengeIsActive(Boolean(campaign.isActive));
    setChallengeFormMessage(`Editing "${campaign.name}"`);
  }, []);

  const submitChallengeCampaign = useCallback(async () => {
    setErrorMessage("");
    setChallengeFormMessage("");

    const name = challengeName.trim();
    const rules = challengeRules.trim();
    if (!name || !rules) {
      setErrorMessage("Challenge name and rules are required.");
      return;
    }

    try {
      let resolvedChallengeImageUrl = challengeImageRemoved ? "" : challengeImageUrl.trim() || undefined;
      if (challengeImageFile) {
        setIsUploadingChallengeImage(true);
        resolvedChallengeImageUrl = await uploadChallengeImageFile(challengeImageFile);
        setChallengeImageUrl(resolvedChallengeImageUrl);
        setChallengeImageRemoved(false);
      }

      const payloadBody = {
      resource: "challenge-campaigns" as const,
      name,
      imageUrl: resolvedChallengeImageUrl,
      imageScale: challengeImageScale,
      imageFocusX: 50,
      imageFocusY: 50,
      imageFit: challengeImageFit,
      rules,
      venueIds: challengeVenueIds,
      activeDays: challengeActiveDays,
      startTime: challengeStartTime || undefined,
      endTime: challengeEndTime || undefined,
      endDate: challengeEndDate || undefined,
      gameTypes: challengeGameTypes,
      pointMultiplier: Number.parseFloat(challengePointMultiplier || "1") || 1,
      pointsRequiredToWin: Number.parseInt(challengePointsRequired || "100", 10) || 100,
      recurringType: challengeRecurringType,
      isActive: challengeIsActive,
      };

      const response = await adminFetch("/api/admin", {
        method: editingChallengeCampaignId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingChallengeCampaignId
            ? {
                ...payloadBody,
                id: editingChallengeCampaignId,
              }
            : payloadBody
        ),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to save challenge campaign.");
      }
      setChallengeFormMessage(editingChallengeCampaignId ? "Challenge campaign updated." : "Challenge campaign created.");
      await loadAll();
      resetChallengeForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save challenge campaign.");
    } finally {
      setIsUploadingChallengeImage(false);
    }
  }, [
    adminFetch,
    challengeActiveDays,
    challengeEndDate,
    challengeEndTime,
    challengeImageFile,
    challengeGameTypes,
    challengeImageUrl,
    challengeImageScale,
    challengeImageFit,
    challengeImageRemoved,
    challengeIsActive,
    challengeName,
    challengePointMultiplier,
    challengePointsRequired,
    challengeRecurringType,
    challengeRules,
    challengeStartTime,
    challengeVenueIds,
    editingChallengeCampaignId,
    loadAll,
    resetChallengeForm,
    uploadChallengeImageFile,
  ]);

  const deleteChallengeCampaignItem = useCallback(
    async (id: string) => {
      setErrorMessage("");
      try {
        const response = await adminFetch(
          `/api/admin?resource=challenge-campaigns&id=${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );
        const payload = (await response.json()) as { ok: boolean; error?: string };
        if (!payload.ok) {
          throw new Error(payload.error ?? "Failed to delete challenge campaign.");
        }
        if (selectedChallengeCampaignId === id) {
          setSelectedChallengeCampaignId("");
        }
        await loadAll();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to delete challenge campaign.");
      }
    },
    [adminFetch, loadAll, selectedChallengeCampaignId]
  );

  const deleteItem = async (resource: "trivia" | "ads", id: string) => {
    setErrorMessage("");
    try {
      const response = await adminFetch(`/api/admin?resource=${resource}&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Delete failed.");
      }
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Delete failed.");
    }
  };

  const simulateAdEvent = async (adId: string, eventType: "impression" | "click") => {
    setErrorMessage("");
    try {
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "ads-track",
          adId,
          eventType,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to simulate ad event.");
      }
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to simulate ad event.");
    }
  };

  const settlePredictionMarket = async (params: {
    predictionId: string;
    winningOutcomeId?: string;
    settleAsCanceled?: boolean;
  }) => {
    setErrorMessage("");
    setSettlingPredictionId(params.predictionId);
    try {
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "predictions-settle",
          predictionId: params.predictionId,
          winningOutcomeId: params.winningOutcomeId,
          settleAsCanceled: params.settleAsCanceled,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to settle prediction market.");
      }
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to settle prediction market.");
    } finally {
      setSettlingPredictionId(null);
    }
  };

  const runAutoSettlement = async () => {
    setErrorMessage("");
    setAutoSettleMessage("");
    setAutoSettlingPredictions(true);
    try {
      const response = await adminFetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "predictions-auto-settle",
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        result?: { settledMarkets?: number; affectedPicks?: number };
      };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to auto-settle predictions.");
      }
      const settled = payload.result?.settledMarkets ?? 0;
      const affected = payload.result?.affectedPicks ?? 0;
      setAutoSettleMessage(`Auto-settlement complete: ${settled} markets, ${affected} picks.`);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to auto-settle predictions.");
    } finally {
      setAutoSettlingPredictions(false);
    }
  };

  const beginEditVenue = (venue: Venue) => {
    setEditingVenueId(venue.id);
    setEditVenueName(venue.name);
    setEditVenueDisplayName(venue.displayName ?? venue.name);
    setEditVenueLogoText(venue.logoText ?? "");
    setEditVenueIconEmoji(venue.iconEmoji ?? "");
    setEditVenueAddress(venue.address ?? "");
    setEditVenueLatitude(venue.latitude.toString());
    setEditVenueLongitude(venue.longitude.toString());
    setEditVenueRadius(venue.radius);
    setEditAddressSuggestions([]);
    setIsEditAddressLookupLoading(false);
    setVenueEditMessage("");
  };

  const saveVenueEdit = async () => {
    if (!editingVenueId) {
      return;
    }

    setErrorMessage("");
    setVenueEditMessage("");

    const parsedLatitude = Number(editVenueLatitude);
    const parsedLongitude = Number(editVenueLongitude);
    const shouldSendCoordinates = Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude);

    try {
      const response = await adminFetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "venues",
          id: editingVenueId,
          name: editVenueName.trim(),
          displayName: editVenueDisplayName.trim() || editVenueName.trim(),
          logoText: editVenueLogoText.trim() || undefined,
          iconEmoji: editVenueIconEmoji.trim() || undefined,
          address: editVenueAddress.trim(),
          radius: editVenueRadius,
          latitude: shouldSendCoordinates ? parsedLatitude : undefined,
          longitude: shouldSendCoordinates ? parsedLongitude : undefined,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string; item?: Venue };
      if (!payload.ok || !payload.item) {
        throw new Error(payload.error ?? "Failed to update venue.");
      }

      setAvailableVenues((prev) =>
        [...prev.filter((venue) => venue.id !== payload.item!.id), payload.item!].sort((a, b) =>
          (a.displayName ?? a.name).localeCompare(b.displayName ?? b.name)
        )
      );
      setSelectedVenueUserId(payload.item.id);
      setSelectedManagedVenueId(payload.item.id);
      setEditingVenueId(null);
      setVenueEditMessage(`Venue updated: ${payload.item.id}`);
      await loadVenueUsers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update venue.");
    }
  };

  const beginEditUser = (user: AdminVenueUser) => {
    setEditingUserId(user.id);
    setEditUserUsername(user.username);
    setEditUserPoints(user.points);
  };

  const saveUserEdit = async () => {
    if (!editingUserId) {
      return;
    }

    setErrorMessage("");
    try {
      const response = await adminFetch(`/api/admin/users/${encodeURIComponent(editingUserId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: editUserUsername,
          points: editUserPoints,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to update user.");
      }
      setEditingUserId(null);
      await Promise.all([loadVenueUsers(), loadAll()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update user.");
    }
  };

  const beginEditQuestion = (item: TriviaQuestion) => {
    setEditingQuestionId(item.id);
    setEditQuestionText(item.question);
    setEditOptionsText(item.options.join(", "));
    setEditCorrectAnswer(item.correctAnswer);
    setEditCategory(item.category ?? "");
    setEditDifficulty(item.difficulty ?? "");
  };

  const saveQuestionEdit = async () => {
    if (!editingQuestionId) return;
    setErrorMessage("");
    try {
      const response = await adminFetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "trivia",
          id: editingQuestionId,
          question: editQuestionText,
          options: parsedEditOptions,
          correctAnswer: editCorrectAnswer,
          category: editCategory,
          difficulty: editDifficulty,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to update trivia question.");
      }
      setEditingQuestionId(null);
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update trivia question.");
    }
  };

  const beginEditAd = (item: Advertisement) => {
    setAdsListReturnToBoard(false);
    setEditingAdId(item.id);
    setEditPageKey(item.pageKey === "global" ? "join" : item.pageKey);
    setEditAdType(item.adType);
    setEditDisplayTrigger(item.displayTrigger);
    setEditPlacementKey(item.placementKey ?? "default");
    setEditRoundNumber(item.roundNumber ?? "all");
    setEditSequenceIndex(item.sequenceIndex ?? 1);
    setEditSlot(item.slot);
    setEditVenueIds(item.venueIds && item.venueIds.length > 0 ? item.venueIds : item.venueId ? [item.venueId] : []);
    setEditTargetAllVenues(Boolean(item.targetAllVenues ?? false));
    setEditTargetCitiesText(item.targetCities?.join(", ") ?? "");
    setEditTargetZipCodesText(item.targetZipCodes?.join(", ") ?? "");
    setEditTargetCountiesText(item.targetCounties?.join(", ") ?? "");
    setEditTargetStatesText(item.targetStates?.join(", ") ?? "");
    setEditTargetRegionsText(item.targetRegions?.join(", ") ?? "");
    setEditAdvertiserName(item.advertiserName);
    setEditImageUrl(item.imageUrl);
    setEditAdImageFile(null);
    setEditAdImageDetails("");
    setEditClickUrl(item.clickUrl);
    setEditAltText(item.altText);
    setEditWidth(item.width);
    setEditHeight(item.height);
    setEditFrequencyInterval(item.frequencyInterval ?? 1);
    setEditIsPlaceholderAd(Boolean(item.isPlaceholder));
    setEditDismissDelaySeconds(item.dismissDelaySeconds ?? 3);
    setEditPopupCooldownSeconds(item.popupCooldownSeconds ?? 180);
    setEditActive(item.active);
    setEditStartDate(isoToDateTimeLocal(item.startDate));
    setEditEndDate(item.endDate ? isoToDateTimeLocal(item.endDate) : "");
  };

  const startCreateAdFromSlot = (slotConfig: AdInventorySlot) => {
    setActiveSection("ads-create");
    setAdsCreateReturnSection("ads-list");
    setPageKey(slotConfig.pageKey);
    setAdType(slotConfig.adType);
    setDisplayTrigger(slotConfig.displayTrigger ?? "on-load");
    setPlacementKey(slotConfig.placementKey ?? "default");
    setRoundNumber(Number.isFinite(slotConfig.roundNumber) ? Number(slotConfig.roundNumber) : "all");
    setSequenceIndex(Number.isFinite(slotConfig.sequenceIndex) ? Number(slotConfig.sequenceIndex) : 1);
    setVenueIds(selectedManagedVenueId ? [selectedManagedVenueId] : []);
    setTargetAllVenues(false);
    setErrorMessage("");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const openAdEditorFromBoard = (item: Advertisement) => {
    setActiveSection("ads-list");
    beginEditAd(item);
    setAdsListReturnToBoard(true);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const row = document.getElementById(`ad-row-${item.id}`);
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  };

  const saveAdEdit = async () => {
    if (!editingAdId) return;
    setErrorMessage("");
    setIsUploadingEditAdImage(true);
    try {
      const nextImageUrl = editAdImageFile ? await uploadAdImageFile(editAdImageFile) : editImageUrl;
      if (!nextImageUrl.trim()) {
        throw new Error("Select an ad image or keep an existing image URL.");
      }
      setEditImageUrl(nextImageUrl);
      const computedEditRoundNumber =
        editPageKey === "trivia" && editDisplayTrigger === "round-end" && editRoundNumber !== "all"
          ? editRoundNumber
          : undefined;
      const computedEditSequenceIndex =
        editAdType === "inline" && editPageKey === "venue"
          ? editSequenceIndex
          : undefined;
      const computedEditDismissDelaySeconds = editAdType === "inline" ? undefined : editDismissDelaySeconds;
      const computedEditPopupCooldownSeconds = editAdType === "inline" ? undefined : editPopupCooldownSeconds;
      const response = await adminFetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "ads",
          id: editingAdId,
          slot: editSlot,
          isPlaceholder: editIsPlaceholderAd,
          pageKey: editPageKey,
          adType: editAdType,
          displayTrigger: editDisplayTrigger,
          placementKey: editPlacementKey.trim() || undefined,
          roundNumber: computedEditRoundNumber,
          sequenceIndex: computedEditSequenceIndex,
          venueIds: editVenueIds.length > 0 ? editVenueIds : undefined,
          targetAllVenues: editTargetAllVenues,
          targetCities: parseTargetList(editTargetCitiesText),
          targetZipCodes: parseTargetList(editTargetZipCodesText),
          targetCounties: parseTargetList(editTargetCountiesText),
          targetStates: parseTargetList(editTargetStatesText),
          targetRegions: parseTargetList(editTargetRegionsText),
          advertiserName: editAdvertiserName,
          imageUrl: nextImageUrl,
          clickUrl: editClickUrl,
          altText: editAltText,
          width: editWidth,
          height: editHeight,
          frequencyInterval: editFrequencyInterval,
          dismissDelaySeconds: computedEditDismissDelaySeconds,
          popupCooldownSeconds: computedEditPopupCooldownSeconds,
          active: editActive,
          startDate: new Date(editStartDate).toISOString(),
          endDate: editEndDate ? new Date(editEndDate).toISOString() : undefined,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to update ad.");
      }
      setEditingAdId(null);
      setAdsListReturnToBoard(false);
      setEditAdImageFile(null);
      setEditAdImageDetails("");
      await loadAll();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update ad.");
    } finally {
      setIsUploadingEditAdImage(false);
    }
  };

  const bootstrapAdminAccess = async () => {
    if (!adminLoginUsername.trim() || !adminLoginPassword) {
      setErrorMessage("Enter admin username and password.");
      return;
    }

    setErrorMessage("");
    setAdminLoginMessage("");
    setBootstrappingAdmin(true);
    try {
      const response = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: adminLoginUsername.trim(),
          password: adminLoginPassword,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to bootstrap admin access.");
      }

      setAdminCredentials({
        username: adminLoginUsername.trim(),
        password: adminLoginPassword,
      });
      setAdminLoginMessage("Admin login successful. Loading admin data...");
      setAdminLoginPassword("");
      await Promise.all([loadAll(), loadVenueUsers()]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to bootstrap admin access.");
    } finally {
      setBootstrappingAdmin(false);
    }
  };

  const logoutAdminAccess = async () => {
    setErrorMessage("");
    setAdminLoginMessage("");
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Even if the request fails, clear local credential state.
    } finally {
      setAdminCredentials(null);
      setAdminLoginPassword("");
      setState("loading");
      if (typeof window !== "undefined") {
        window.location.assign("/");
      }
    }
  };

  const shouldShowBootstrap =
    !adminCredentials &&
    (state === "error" ||
      errorMessage.toLowerCase().includes("admin privileges required") ||
      errorMessage.toLowerCase().includes("admin login required") ||
      errorMessage.toLowerCase().includes("missing bearer token"));
  const showLogout = !shouldShowBootstrap && (Boolean(adminCredentials) || state === "idle");
  const isSectionMode = mode === "section";
  const selectedSection = ADMIN_SECTION_OPTIONS.find((section) => section.id === activeSection) ?? null;
  const shouldRenderSectionContent = !shouldShowBootstrap && (isSectionMode || mode === "dashboard");
  const isManageAdvertisementsSection = shouldRenderSectionContent && activeSection === "ads-list";

  return (
    <div
      className={`admin-console min-w-0 max-w-full space-y-6 overflow-x-hidden [&_*]:max-w-full [&_*]:min-w-0 ${
        isManageAdvertisementsSection ? "admin-console--ads-list" : ""
      }`}
      style={{ fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' }}
    >
      {showLogout ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              void logoutAdminAccess();
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Log Out
          </button>
        </div>
      ) : null}

      {shouldShowBootstrap ? (
        <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back();
                return;
              }
              router.push("/");
            }}
            className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Back
          </button>
          <h2 className="text-base font-semibold text-amber-900">Admin Login</h2>
          <p className="text-sm text-amber-800">
            Sign in with configured admin credentials to access admin tools. A venue profile is not required.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="text"
              value={adminLoginUsername}
              onChange={(event) => setAdminLoginUsername(event.target.value)}
              placeholder="Admin username"
              className="w-full rounded-md border border-amber-300 px-3 py-2.5 text-sm"
            />
            <input
              type="password"
              value={adminLoginPassword}
              onChange={(event) => setAdminLoginPassword(event.target.value)}
              placeholder="Admin password"
              className="w-full rounded-md border border-amber-300 px-3 py-2.5 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                void bootstrapAdminAccess();
              }}
              disabled={bootstrappingAdmin}
              className="sm:col-span-2 rounded-md bg-amber-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {bootstrappingAdmin ? "Logging in..." : "Admin Login"}
            </button>
          </div>
          {adminLoginMessage ? <p className="text-xs text-emerald-700">{adminLoginMessage}</p> : null}
        </section>
      ) : null}

      {errorMessage && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}
      {state === "loading" && <p className="text-sm text-slate-600">Loading admin data...</p>}

      {shouldRenderSectionContent ? (
        <aside className="hidden lg:fixed lg:inset-y-20 lg:left-4 lg:block lg:w-64 lg:overflow-y-auto lg:rounded-xl lg:border lg:border-slate-200 lg:bg-white lg:p-3 lg:shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Admin Tools</p>
          <div className="mt-2 space-y-1">
            {ADMIN_SECTION_OPTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm font-semibold ${
                  activeSection === section.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {section.label}
              </button>
            ))}
            <a
              href="/faqs"
              className="block w-full rounded-md bg-slate-100 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              FAQs Page
            </a>
          </div>
        </aside>
      ) : null}

      {!shouldShowBootstrap && !isSectionMode ? (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h2 className="text-lg font-semibold">Admin Tools</h2>
          <p className="text-sm text-slate-600">Tap a tool to open its page.</p>
          <button
            type="button"
            onClick={() => {
              setActiveSection("live-trivia");
              router.push("/admin/live-trivia");
            }}
            className="w-full rounded-md border border-emerald-700 bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 sm:w-auto"
          >
            Create/Manage Live Trivia
          </button>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:hidden">
            {ADMIN_SECTION_OPTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  router.push(`/admin/${section.slug}`);
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                {section.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {!shouldShowBootstrap && isSectionMode ? (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <button
            type="button"
            onClick={() => {
              router.push("/admin");
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:w-auto"
          >
            Back to Admin Dashboard
          </button>
          <h2 className="text-lg font-semibold">{selectedSection?.label ?? "Admin Tool"}</h2>
        </section>
      ) : null}

      {shouldRenderSectionContent && activeSection === "live-trivia" ? (
      <section className="space-y-4 rounded-lg border border-slate-200 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold">Create/Manage Live Trivia</h2>
          <button
            type="button"
            onClick={() => {
              void loadLiveShowdownSchedules();
            }}
            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white"
          >
            Refresh Sessions
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className={FORM_LABEL_CLASS}>Title</span>
            <input
              type="text"
              value={liveTriviaTitle}
              onChange={(event) => setLiveTriviaTitle(event.target.value)}
              placeholder="Tuesday Night Showdown"
              className={FORM_SELECT_CLASS}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className={FORM_LABEL_CLASS}>Target Date</span>
            <input
              type="date"
              value={liveTriviaTargetDate}
              onChange={(event) => setLiveTriviaTargetDate(event.target.value)}
              className={FORM_SELECT_CLASS}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className={FORM_LABEL_CLASS}>Start Time</span>
            <input
              type="time"
              value={liveTriviaStartTime}
              onChange={(event) => setLiveTriviaStartTime(event.target.value)}
              className={FORM_SELECT_CLASS}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className={FORM_LABEL_CLASS}>Timezone</span>
            <select
              value={liveTriviaTimezone}
              onChange={(event) => setLiveTriviaTimezone(event.target.value)}
              className={FORM_SELECT_CLASS}
            >
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Denver">America/Denver</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className={FORM_LABEL_CLASS}>Number of Rounds</span>
            <input
              type="number"
              min={1}
              max={24}
              value={liveTriviaNumRounds}
              onChange={(event) => setLiveTriviaNumRounds(event.target.value)}
              className={FORM_SELECT_CLASS}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className={FORM_LABEL_CLASS}>Venue Allocation</span>
            <select
              value={liveTriviaVenueId}
              onChange={(event) => setLiveTriviaVenueId(event.target.value)}
              className={FORM_SELECT_CLASS}
            >
              <option value="">Select venue</option>
              {availableVenues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {getVenueDisplayName(venue)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            void createLiveShowdownSchedule();
          }}
          disabled={creatingLiveTrivia}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {creatingLiveTrivia ? "Creating..." : "Save / Create Competition"}
        </button>

        {liveTriviaMessage ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">{liveTriviaMessage}</p>
        ) : null}

        {isDevTestingControlsEnabled ? (
          <section className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
            <h3 className="text-sm font-semibold text-amber-900">Developer Testing Controls</h3>
            <p className="text-xs text-amber-800">
              Local admin helpers for playtesting: force phase progression and clear submissions for replay.
            </p>
            <div className="space-y-2">
              {liveShowdownSchedules.map((schedule) => (
                <div key={schedule.id} className="rounded-md border border-amber-200 bg-white p-2">
                  <p className="text-xs font-semibold text-slate-900">{schedule.title}</p>
                  <p className="text-[11px] text-slate-600">
                    {schedule.venueId ? venueNameById.get(schedule.venueId) ?? schedule.venueId : "No venue"} ·{" "}
                    {new Date(schedule.startTime).toLocaleString()} · {schedule.numRounds} rounds
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void runLiveTriviaDevControl(
                          schedule.id,
                          "live-showdown-force-next-phase",
                          "Forced next Live Trivia question phase."
                        );
                      }}
                      disabled={devControlBusyScheduleId === schedule.id}
                      className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-60"
                    >
                      Force Trigger Next Question Phase
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void runLiveTriviaDevControl(
                          schedule.id,
                          "live-showdown-reset-answers",
                          "Reset Live Session Answers complete."
                        );
                      }}
                      disabled={devControlBusyScheduleId === schedule.id}
                      className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                    >
                      Reset Live Session Answers
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="space-y-2 rounded-md border border-slate-200 p-3">
          <h3 className="text-sm font-semibold">Scheduled Sessions</h3>
          {liveShowdownSchedules.length === 0 ? (
            <p className="text-xs text-slate-600">No Live Trivia sessions yet.</p>
          ) : (
            <ul className="space-y-2">
              {liveShowdownSchedules.map((schedule) => (
                <li key={schedule.id} className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                  <p className="font-semibold text-slate-900">{schedule.title}</p>
                  <p className="text-slate-600">
                    Venue: {schedule.venueId ? venueNameById.get(schedule.venueId) ?? schedule.venueId : "No venue"} ·
                    Start: {new Date(schedule.startTime).toLocaleString()} ({schedule.timezone}) · Rounds: {schedule.numRounds}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
      ) : null}

      {shouldRenderSectionContent && activeSection === "ad-debug" ? (
      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold">Ad Debug Snapshot</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={adsWindowHours}
              onChange={(event) => setAdsWindowHours(Number(event.target.value))}
              className="rounded-md border border-slate-300 px-2 py-2 text-xs"
            >
              <option value={24}>Last 24h</option>
              <option value={168}>Last 7d</option>
              <option value={720}>Last 30d</option>
            </select>
            <button
              type="button"
              onClick={() => {
                void loadAll();
              }}
              className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white"
            >
              Refresh
            </button>
          </div>
        </div>

        {!adsDebug ? (
          <p className="text-sm text-slate-600">No snapshot available yet.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-500">
              Generated: {new Date(adsDebug.generatedAt).toLocaleString()}
            </p>
            <p className="text-xs text-slate-500">
              Window start: {new Date(adsDebug.windowStart).toLocaleString()}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Total Ads</p>
                <p className="font-semibold">{adsDebug.totalAds}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Active Now</p>
                <p className="font-semibold">{adsDebug.activeAds}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Impressions</p>
                <p className="font-semibold">{adsDebug.totalImpressions}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Overall CTR</p>
                <p className="font-semibold">{adsDebug.overallCtr.toFixed(2)}%</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Window Impr</p>
                <p className="font-semibold">{adsDebug.windowImpressions}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Window Clicks</p>
                <p className="font-semibold">{adsDebug.windowClicks}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs text-slate-500">Window CTR</p>
                <p className="font-semibold">{adsDebug.windowCtr.toFixed(2)}%</p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Slot Coverage</p>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {adsDebug.slotCoverage.map((item) => (
                  <li key={item.slot} className="rounded-md border border-slate-200 px-2 py-1.5 text-xs">
                    <span className="font-medium">{item.slot}</span>:{" "}
                    {item.hasActiveAd ? `${item.activeCount} active` : "none"}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Top Impressions</p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByImpressions.map((ad) => (
                    <li key={`impr-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                      {ad.advertiserName} ({ad.impressions ?? 0})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Top Clicks</p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByClicks.map((ad) => (
                    <li key={`clk-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                      {ad.advertiserName} ({ad.clicks ?? 0})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Top CTR</p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByCtr.map((ad) => {
                    const ctr =
                      (ad.impressions ?? 0) > 0 ? (((ad.clicks ?? 0) / (ad.impressions ?? 0)) * 100).toFixed(2) : "0.00";
                    return (
                      <li key={`ctr-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                        {ad.advertiserName} ({ctr}%)
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Top Window Impr
                </p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByWindowImpressions.map((ad) => (
                    <li key={`wimpr-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                      {ad.advertiserName} ({adsDebug.windowMetricsByAd[ad.id]?.impressions ?? 0})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Top Window Clicks
                </p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByWindowClicks.map((ad) => (
                    <li key={`wclk-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                      {ad.advertiserName} ({adsDebug.windowMetricsByAd[ad.id]?.clicks ?? 0})
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Top Window CTR
                </p>
                <ul className="space-y-1 text-xs">
                  {adsDebug.topByWindowCtr.map((ad) => (
                    <li key={`wctr-${ad.id}`} className="rounded-md border border-slate-200 px-2 py-1.5">
                      {ad.advertiserName} ({(adsDebug.windowMetricsByAd[ad.id]?.ctr ?? 0).toFixed(2)}%)
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>
      ) : null}

      {shouldRenderSectionContent && activeSection === "prediction-settlement" ? (
      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold">Pending Prediction Settlement</h2>
          <button
            type="button"
            onClick={() => {
              void runAutoSettlement();
            }}
            disabled={autoSettlingPredictions}
            className="w-full rounded-md bg-indigo-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 sm:w-auto sm:text-xs"
          >
            {autoSettlingPredictions ? "Syncing..." : "Run Auto-Settlement Now"}
          </button>
        </div>
        {autoSettleMessage ? <p className="text-xs text-emerald-700">{autoSettleMessage}</p> : null}
        {pendingPredictions.length === 0 ? (
          <p className="text-sm text-slate-600">No pending prediction markets to settle.</p>
        ) : (
          <ul className="space-y-2">
            {pendingPredictions.map((market) => (
              <li key={market.predictionId} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="break-all font-medium">Market: {market.predictionId}</p>
                <p className="text-xs text-slate-500">
                  Picks: {market.totalPicks} | Latest: {new Date(market.latestPickAt).toLocaleString()}
                </p>
                <div className="mt-2 space-y-2">
                  {market.outcomes.map((outcome) => (
                    <div
                      key={`${market.predictionId}-${outcome.outcomeId}`}
                      className="flex flex-col gap-2 rounded-md border border-slate-100 bg-slate-50 px-2 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="text-xs text-slate-700">
                        {outcome.outcomeTitle} ({outcome.pickCount} picks)
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          void settlePredictionMarket({
                            predictionId: market.predictionId,
                            winningOutcomeId: outcome.outcomeId,
                          });
                        }}
                        disabled={settlingPredictionId === market.predictionId}
                        className="w-full rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 sm:w-auto sm:px-2 sm:py-1 sm:text-xs"
                      >
                        Settle Winner
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void settlePredictionMarket({
                      predictionId: market.predictionId,
                      settleAsCanceled: true,
                    });
                  }}
                  disabled={settlingPredictionId === market.predictionId}
                  className="mt-2 w-full rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 sm:w-auto sm:py-1.5 sm:text-xs"
                >
                  Settle as Canceled
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : null}

      {shouldRenderSectionContent && activeSection === "venue-users" ? (
      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Venue User Management</h2>
        <div className="max-w-sm">
          <select
            value={selectedVenueUserId}
            onChange={(event) => setSelectedVenueUserId(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {availableVenues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {getVenueDisplayName(venue)}
              </option>
            ))}
          </select>
        </div>

        {venueUsers.length === 0 ? (
          <p className="text-sm text-slate-600">No users found for this venue.</p>
        ) : (
          <ul className="space-y-2">
            {venueUsers.map((user) => (
              <li key={user.id} className="rounded-md border border-slate-200 p-2 text-sm">
                {editingUserId === user.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        value={editUserUsername}
                        onChange={(event) => setEditUserUsername(event.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="number"
                        min={0}
                        value={editUserPoints}
                        onChange={(event) => setEditUserPoints(Number(event.target.value))}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void saveUserEdit();
                        }}
                        className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingUserId(null)}
                        className="rounded-md bg-slate-500 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium">
                      {user.username}
                      {user.isAdmin ? (
                        <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          Admin
                        </span>
                      ) : null}
                    </p>
                    <p className="break-words text-xs text-slate-500">
                      Points: {user.points} | Joined: {new Date(user.createdAt).toLocaleString()}
                    </p>
                    <button
                      type="button"
                      onClick={() => beginEditUser(user)}
                      className="mt-2 rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                    >
                      Edit User
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : null}

      {shouldRenderSectionContent && activeSection === "venue-manage" ? (
      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Venue Profile Management</h2>
        <div className="max-w-sm">
          <select
            value={selectedManagedVenueId}
            onChange={(event) => {
              const nextId = event.target.value;
              setSelectedManagedVenueId(nextId);
              const venue = availableVenues.find((item) => item.id === nextId);
              if (venue) {
                beginEditVenue(venue);
              }
            }}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {availableVenues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {getVenueDisplayName(venue)}
              </option>
            ))}
          </select>
        </div>
        {editingVenueId ? (
          <div className="space-y-2 rounded-md border border-slate-200 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={editVenueName}
                onChange={(event) => setEditVenueName(event.target.value)}
                placeholder="Venue name"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={editVenueDisplayName}
                onChange={(event) => setEditVenueDisplayName(event.target.value)}
                placeholder="Display name (join card/title)"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={editVenueLogoText}
                onChange={(event) => setEditVenueLogoText(event.target.value)}
                placeholder="Logo initials (e.g. BG)"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={editVenueIconEmoji}
                onChange={(event) => setEditVenueIconEmoji(event.target.value)}
                placeholder="Icon emoji (e.g. 🍺)"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <input
              value={editVenueAddress}
              onChange={handleEditVenueAddressInput}
              placeholder="Venue address"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="relative">
              <p className="text-xs text-slate-500">
                {isEditAddressLookupLoading
                  ? "Searching addresses..."
                  : "Coordinates auto-fill from the top address match as you type."}
              </p>
              {editAddressSuggestions.length > 0 ? (
                <ul className="absolute z-20 mt-2 w-full rounded-md border border-slate-200 bg-white shadow">
                  {editAddressSuggestions.map((suggestion) => (
                    <li key={suggestion.label}>
                      <button
                        type="button"
                        onMouseDown={() => pickEditAddressSuggestion(suggestion)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                      >
                        {suggestion.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                type="number"
                value={editVenueLatitude}
                onChange={(event) => setEditVenueLatitude(event.target.value)}
                placeholder="Latitude"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                value={editVenueLongitude}
                onChange={(event) => setEditVenueLongitude(event.target.value)}
                placeholder="Longitude"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={25}
                max={2000}
                value={editVenueRadius}
                onChange={(event) => setEditVenueRadius(Number(event.target.value))}
                placeholder="Radius (m)"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void saveVenueEdit();
                }}
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
              >
                Save Venue
              </button>
              <button
                type="button"
                onClick={() => {
                  const venue = availableVenues.find((item) => item.id === selectedManagedVenueId);
                  if (venue) {
                    beginEditVenue(venue);
                  }
                }}
                className="rounded-md bg-slate-500 px-3 py-2 text-sm font-medium text-white"
              >
                Reset
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              const venue = availableVenues.find((item) => item.id === selectedManagedVenueId);
              if (venue) {
                beginEditVenue(venue);
              }
            }}
            className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white"
          >
            Edit Selected Venue
          </button>
        )}
        {venueEditMessage ? <p className="text-xs text-emerald-700">{venueEditMessage}</p> : null}
      </section>
      ) : null}

      {shouldRenderSectionContent && activeSection === "venue-create" ? (
      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Create Venue</h2>
        <p className="text-xs text-slate-600">
          Enter a real-world address. We geocode it to coordinates and create a venue that users can join immediately.
        </p>
        <div className="grid grid-cols-1 gap-2">
          <input
            value={newVenueName}
            onChange={(event) => setNewVenueName(event.target.value)}
            placeholder="Venue name (e.g. Downtown Sports Bar)"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <input
          value={newVenueAddress}
          onChange={handleVenueAddressInput}
          placeholder="Street address, city, state (or full address)"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="relative">
          <p className="text-xs text-slate-500">
            {isAddressLookupLoading ? "Searching addresses..." : "Start typing to see address options."}
          </p>
          {addressSuggestions.length > 0 ? (
            <ul className="absolute z-20 mt-2 w-full rounded-md border border-slate-200 bg-white shadow">
              {addressSuggestions.map((suggestion) => (
                <li key={suggestion.label}>
                  <button
                    type="button"
                    onMouseDown={() => pickAddressSuggestion(suggestion)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                  >
                    {suggestion.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="max-w-xs">
          <label className="mb-1 block text-xs font-medium text-slate-700">Geofence radius (meters)</label>
          <input
            type="number"
            min={25}
            max={2000}
            value={newVenueRadius}
            onChange={(event) => setNewVenueRadius(Number(event.target.value))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            void createVenue();
          }}
          disabled={creatingVenue}
          className="w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
        >
          {creatingVenue ? "Creating Venue..." : "Create Venue"}
        </button>
        {venueCreateMessage ? <p className="text-xs text-emerald-700">{venueCreateMessage}</p> : null}
      </section>
      ) : null}

      {shouldRenderSectionContent && activeSection === "trivia-create" ? (
      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Create Trivia Question</h2>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Question text"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={optionsText}
          onChange={(event) => setOptionsText(event.target.value)}
          placeholder="Comma separated options"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            type="number"
            min={0}
            value={correctAnswer}
            onChange={(event) => setCorrectAnswer(Number(event.target.value))}
            placeholder="Correct index"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Category"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
            placeholder="Difficulty"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <p className="text-xs text-slate-500">Current options count: {parsedOptions.length}</p>
        <button
          type="button"
          onClick={() => {
            void createTrivia();
          }}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white sm:w-auto"
        >
          Create Question
        </button>
      </section>
      ) : null}

      {shouldRenderSectionContent && activeSection === "ads-create" ? (
      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        {adsCreateReturnSection ? (
          <button
            type="button"
            onClick={() => {
              setActiveSection(adsCreateReturnSection);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Back to Manage Advertisements
          </button>
        ) : null}
        <h2 className="text-base font-semibold">Create Advertisement</h2>
        <p className="text-sm text-slate-600">
          Choose the page first, then ad type and trigger. Round-end only applies to Trivia.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={FORM_LABEL_CLASS}>Page</label>
            <select
              value={pageKey}
              onChange={(event) => setPageKey(event.target.value as AdPageKey)}
              className={FORM_SELECT_CLASS}
            >
              {AD_PAGE_KEYS.map((item) => (
                <option key={item} value={item}>
                  {AD_PAGE_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={FORM_LABEL_CLASS}>Ad Type</label>
            <select
              value={adType}
              onChange={(event) => setAdType(event.target.value as AdType)}
              className={FORM_SELECT_CLASS}
            >
              {availableAdTypes.map((item) => (
                <option key={item} value={item}>
                  {AD_TYPE_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={FORM_LABEL_CLASS}>When It Appears</label>
            <select
              value={displayTrigger}
              onChange={(event) => setDisplayTrigger(event.target.value as AdDisplayTrigger)}
              className={FORM_SELECT_CLASS}
            >
              {availableTriggers.map((item) => (
                <option key={item} value={item}>
                  {AD_TRIGGER_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
          {pageKey === "trivia" && displayTrigger === "round-end" ? (
            <div className="space-y-1">
              <label className={FORM_LABEL_CLASS}>Trivia Round</label>
              <select
                value={roundNumber}
                onChange={(event) => {
                  const value = event.target.value;
                  setRoundNumber(value === "all" ? "all" : Number(value));
                }}
                className={FORM_SELECT_CLASS}
              >
                <option value="1">Round 1</option>
                <option value="2">Round 2</option>
                <option value="3">Round 3</option>
              </select>
            </div>
          ) : null}
          {pageKey === "venue" && adType === "inline" ? (
            <div className="space-y-1">
              <label className={FORM_LABEL_CLASS}>Inline Leaderboard Slot</label>
              <select
                value={sequenceIndex}
                onChange={(event) => setSequenceIndex(Number(event.target.value))}
                className={FORM_SELECT_CLASS}
              >
                {VENUE_INLINE_VARIANTS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Leaderboard ad spaces appear every 10 rows and cycle through Variants 1-5.
              </p>
            </div>
          ) : null}
          <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Technical Slot (Auto)</p>
            <p className="mt-1 font-semibold">{slot}</p>
            <p className="mt-1 text-xs text-slate-600">
              Auto-mapped from your page/type/trigger choices.
            </p>
          </div>
          <div className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Venue targeting</p>
            <p className="mt-1 text-xs text-slate-600">
              {targetAllVenues ? "All venues" : `${venueIds.length} selected`}
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={targetAllVenues}
                onChange={(event) => setTargetAllVenues(event.target.checked)}
              />
              All venues
            </label>
            <input
              value={venueSearch}
              onChange={(event) => setVenueSearch(event.target.value)}
              placeholder="Search venues…"
              disabled={targetAllVenues}
              className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1 text-xs disabled:opacity-50"
            />
            <div className="mt-1 max-h-32 space-y-1 overflow-y-auto pr-1">
              {availableVenues
                .filter((venue) =>
                  !venueSearch.trim() ||
                  getVenueDisplayName(venue).toLowerCase().includes(venueSearch.trim().toLowerCase())
                )
                .map((venue) => (
                  <label key={venue.id} className="flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={venueIds.includes(venue.id)}
                      disabled={targetAllVenues}
                      onChange={() => setVenueIds((current) => toggleVenueSelection(current, venue.id))}
                    />
                    {getVenueDisplayName(venue)}
                  </label>
                ))}
            </div>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Geo targeting (optional)</p>
            <input value={targetCitiesText} onChange={(event) => setTargetCitiesText(event.target.value)} placeholder="Cities (comma-separated)" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
            <input value={targetZipCodesText} onChange={(event) => setTargetZipCodesText(event.target.value)} placeholder="ZIP codes (comma-separated)" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
            <input value={targetCountiesText} onChange={(event) => setTargetCountiesText(event.target.value)} placeholder="Counties (comma-separated)" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
            <input value={targetStatesText} onChange={(event) => setTargetStatesText(event.target.value)} placeholder="States (e.g. NY, CA)" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
            <input value={targetRegionsText} onChange={(event) => setTargetRegionsText(event.target.value)} placeholder="Regions (NORTHEAST, MIDWEST, SOUTH, WEST)" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Advertiser Name</label>
          <input
            value={advertiserName}
            onChange={(event) => setAdvertiserName(event.target.value)}
            placeholder="Ex: Nike, DraftKings, Local Pizza Shop"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
            Ad Image (Static Only)
          </label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              void handleAdImageSelection(event);
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            Allowed: JPG, PNG, WebP. Max size: 300KB. 9:16 is ideal, but other ratios now auto-fit.
          </p>
          {adImageDetails ? <p className="text-xs text-emerald-700">{adImageDetails}</p> : null}
          {imageUrl ? (
            <p className="break-all text-[11px] text-slate-500">Uploaded URL: {imageUrl}</p>
          ) : null}
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Click URL</label>
          <input
            value={clickUrl}
            onChange={(event) => setClickUrl(event.target.value)}
            placeholder="Where users go when they tap the ad"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Alt Text</label>
          <input
            value={altText}
            onChange={(event) => setAltText(event.target.value)}
            placeholder="Short accessibility description of the ad image"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Image Width (px)</label>
            <input
              type="number"
              min={1}
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
              placeholder="Ex: 320"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Image Height (px)</label>
            <input
              type="number"
              min={1}
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
              placeholder="Ex: 50"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Frequency Interval (N)</label>
            <input
              type="number"
              min={1}
              max={999}
              value={frequencyInterval}
              onChange={(event) => setFrequencyInterval(Math.max(1, Number(event.target.value)))}
              placeholder="1 = every visitor, 3 = every 3rd visitor"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {adType !== "inline" ? (
            <div className="space-y-1">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Dismiss Delay (seconds)</label>
              <input
                type="number"
                min={0}
                max={300}
                value={dismissDelaySeconds}
                onChange={(event) => setDismissDelaySeconds(Number(event.target.value))}
                placeholder="Time before users can tap X"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ) : null}
          {adType !== "inline" ? (
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Popup Cooldown (seconds)</label>
              <input
                type="number"
                min={0}
                max={86400}
                value={popupCooldownSeconds}
                onChange={(event) => setPopupCooldownSeconds(Number(event.target.value))}
                placeholder="Minimum wait before this popup trigger can appear again"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">Frequency interval: 1 = show to every visitor, 3 = show to every 3rd visitor, etc.</p>
        <p className="text-xs text-slate-500">
          Venue targeting: leave all unchecked for all venues, or search and select specific venues.
        </p>
        <p className="text-xs text-slate-500">
          Recommended for <span className="font-semibold">{slot}</span>: {getRecommendedSlotSize(slot).width}x
          {getRecommendedSlotSize(slot).height}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Start Date / Time</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">End Date / Time (Optional)</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          Active
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isPlaceholderAd}
            onChange={(event) => setIsPlaceholderAd(event.target.checked)}
          />
          Placeholder ad (fallback only)
        </label>
        <button
          type="button"
          onClick={() => {
            void createAd();
          }}
          disabled={isUploadingAdImage}
          className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white sm:w-auto"
        >
          {isUploadingAdImage ? "Uploading..." : "Create Advertisement"}
        </button>
      </section>
      ) : null}

      {shouldRenderSectionContent && activeSection === "trivia-list" ? (
      <section className="space-y-2 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Trivia Questions ({questions.length})</h2>
        <ul className="space-y-2">
          {questions.map((item) => (
            <li key={item.id} className="rounded-md border border-slate-200 p-2 text-sm">
              {editingQuestionId === item.id ? (
                <div className="space-y-2">
                  <input
                    value={editQuestionText}
                    onChange={(event) => setEditQuestionText(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={editOptionsText}
                    onChange={(event) => setEditOptionsText(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input
                      type="number"
                      min={0}
                      value={editCorrectAnswer}
                      onChange={(event) => setEditCorrectAnswer(Number(event.target.value))}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      value={editCategory}
                      onChange={(event) => setEditCategory(event.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      value={editDifficulty}
                      onChange={(event) => setEditDifficulty(event.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void saveQuestionEdit();
                      }}
                      className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingQuestionId(null)}
                      className="rounded-md bg-slate-500 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-medium">{item.question}</p>
                  <p className="text-xs text-slate-600">
                    Correct: {item.options[item.correctAnswer] ?? "n/a"} | {item.category ?? "uncategorized"} |{" "}
                    {item.difficulty ?? "unspecified"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => beginEditQuestion(item)}
                      className="rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteItem("trivia", item.id);
                      }}
                      className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
      ) : null}

      {shouldRenderSectionContent && activeSection === "ads-list" ? (
      <section className="admin-ads-shell relative w-full min-w-0 max-w-full space-y-2 overflow-x-hidden rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold">Advertisements ({ads.length})</h2>
        <p className="text-xs text-slate-600">
          Live placement board organized by page. A space is <span className="font-semibold text-emerald-700">occupied</span> when at least one live ad matches it.
        </p>
        <div className="admin-ads-live-board space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-slate-800">Live Ads By Website Page</h3>
          <div className="max-w-sm space-y-1">
            <label className={FORM_LABEL_CLASS}>Venue Context For Placement Availability</label>
            <select
              value={selectedManagedVenueId}
              onChange={(event) => setSelectedManagedVenueId(event.target.value)}
              className={FORM_SELECT_CLASS}
            >
              {availableVenues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {getVenueDisplayName(venue)}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-600">
              Includes ads targeted to this venue and ads targeted to all venues.
            </p>
          </div>
          <div className="space-y-3">
            {liveAdPages.map((pageEntry) => (
              <div key={pageEntry.page} className="admin-ads-page-card min-w-0 rounded-md border border-slate-200 bg-white p-3">
                <div className="admin-ads-page-header flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{AD_PAGE_LABEL[pageEntry.page]}</p>
                  <p className="text-xs text-slate-600">Live ads: {pageEntry.pageLiveAds.length}</p>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                  {AD_TYPE_ORDER.map((typeKey) => {
                    const slotsForType = pageEntry.slotsWithAds.filter((entry) => entry.slot.adType === typeKey);
                    return (
                      <div key={`${pageEntry.page}-${typeKey}`} className="min-w-0 rounded-md border border-slate-200 p-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{AD_TYPE_LABEL[typeKey]}</p>
                        {slotsForType.length === 0 ? (
                          <p className="mt-1 text-xs text-slate-500">No {AD_TYPE_LABEL[typeKey].toLowerCase()} spaces configured.</p>
                        ) : (
                          <div className="mt-2 space-y-1.5">
                            {slotsForType.map((slotEntry) => {
                              const occupied = slotEntry.ads.length > 0;
                              return (
                                <div
                                  key={slotEntry.slot.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => {
                                    if (slotEntry.ads.length > 0) {
                                      openAdEditorFromBoard(slotEntry.ads[0]);
                                      return;
                                    }
                                    startCreateAdFromSlot(slotEntry.slot);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      if (slotEntry.ads.length > 0) {
                                        openAdEditorFromBoard(slotEntry.ads[0]);
                                        return;
                                      }
                                      startCreateAdFromSlot(slotEntry.slot);
                                    }
                                  }}
                                  className={`admin-ads-slot-row rounded-md border px-2 py-1.5 ${
                                    occupied
                                      ? "border-emerald-200 bg-emerald-50"
                                      : "border-amber-200 bg-amber-50"
                                  } w-full cursor-pointer text-left transition-colors hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`}
                                >
                                  <p className="break-words text-xs font-semibold text-slate-800">{slotEntry.slot.label}</p>
                                  <p className={`break-words text-[11px] ${occupied ? "text-emerald-800" : "text-amber-800"}`}>
                                    {occupied ? `Occupied (${slotEntry.ads.length})` : "Available"}
                                  </p>
                                  {slotEntry.ads.length > 0 ? (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {slotEntry.ads.map((adItem) => (
                                        <button
                                          key={adItem.id}
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            openAdEditorFromBoard(adItem);
                                          }}
                                          className="max-w-full break-all whitespace-normal rounded border border-slate-300 bg-white px-1.5 py-0.5 text-left text-[11px] text-slate-700 hover:bg-slate-100"
                                        >
                                          Edit {adItem.advertiserName}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {pageEntry.unmatchedAds.length > 0 ? (
                  <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2">
                    <p className="text-xs font-semibold text-rose-800">Unmapped live ads</p>
                    <p className="break-words text-xs text-rose-700">
                      {pageEntry.unmatchedAds.map((item) => item.advertiserName).join(", ")}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-slate-600">All advertisements (live and scheduled):</p>
          {adsListReturnToBoard && editingAdId ? (
            <button
              type="button"
              onClick={() => {
                setEditingAdId(null);
                if (typeof window !== "undefined") {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              }}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Back to Manage Advertisements
            </button>
          ) : null}
        </div>
        <ul className="admin-ads-list min-w-0 space-y-2">
          {ads.map((item) => (
            <li id={`ad-row-${item.id}`} key={item.id} className="admin-ads-item min-w-0 overflow-hidden rounded-md border border-slate-200 p-2 text-sm">
              {editingAdId === item.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className={FORM_LABEL_CLASS}>Page</label>
                      <select
                        value={editPageKey}
                        onChange={(event) => setEditPageKey(event.target.value as AdPageKey)}
                        className={FORM_SELECT_CLASS}
                      >
                        {AD_PAGE_KEYS.map((item) => (
                          <option key={item} value={item}>
                            {AD_PAGE_LABEL[item]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={FORM_LABEL_CLASS}>Ad Type</label>
                      <select
                        value={editAdType}
                        onChange={(event) => setEditAdType(event.target.value as AdType)}
                        className={FORM_SELECT_CLASS}
                      >
                        {availableEditAdTypes.map((item) => (
                          <option key={item} value={item}>
                            {AD_TYPE_LABEL[item]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={FORM_LABEL_CLASS}>When It Appears</label>
                      <select
                        value={editDisplayTrigger}
                        onChange={(event) => setEditDisplayTrigger(event.target.value as AdDisplayTrigger)}
                        className={FORM_SELECT_CLASS}
                      >
                        {availableEditTriggers.map((item) => (
                          <option key={item} value={item}>
                            {AD_TRIGGER_LABEL[item]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {editPageKey === "trivia" && editDisplayTrigger === "round-end" ? (
                      <div className="space-y-1">
                        <label className={FORM_LABEL_CLASS}>Trivia Round</label>
                        <select
                          value={editRoundNumber}
                          onChange={(event) => {
                            const value = event.target.value;
                            setEditRoundNumber(value === "all" ? "all" : Number(value));
                          }}
                          className={FORM_SELECT_CLASS}
                        >
                          <option value="1">Round 1</option>
                          <option value="2">Round 2</option>
                          <option value="3">Round 3</option>
                        </select>
                      </div>
                    ) : null}
                    {editPageKey === "venue" && editAdType === "inline" ? (
                      <div className="space-y-1">
                        <label className={FORM_LABEL_CLASS}>Inline Leaderboard Slot</label>
                        <select
                          value={editSequenceIndex}
                          onChange={(event) => setEditSequenceIndex(Number(event.target.value))}
                          className={FORM_SELECT_CLASS}
                        >
                          {VENUE_INLINE_VARIANTS.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500">
                          Leaderboard ad spaces appear every 10 rows and cycle through Variants 1-5.
                        </p>
                      </div>
                    ) : null}
                    <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Technical Slot (Auto)</p>
                      <p className="mt-1 font-semibold">{editSlot}</p>
                    </div>
                    <div className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Venue targeting</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {editTargetAllVenues ? "All venues" : `${editVenueIds.length} selected`}
                      </p>
                      <label className="mt-1 flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={editTargetAllVenues}
                          onChange={(event) => setEditTargetAllVenues(event.target.checked)}
                        />
                        All venues
                      </label>
                      <input
                        value={editVenueSearch}
                        onChange={(event) => setEditVenueSearch(event.target.value)}
                        placeholder="Search venues…"
                        disabled={editTargetAllVenues}
                        className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs disabled:opacity-50"
                      />
                      <div className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1">
                        {availableVenues
                          .filter((venue) =>
                            !editVenueSearch.trim() ||
                            getVenueDisplayName(venue).toLowerCase().includes(editVenueSearch.trim().toLowerCase())
                          )
                          .map((venue) => (
                            <label key={venue.id} className="flex items-center gap-2 text-xs text-slate-700">
                              <input
                                type="checkbox"
                                checked={editVenueIds.includes(venue.id)}
                                disabled={editTargetAllVenues}
                                onChange={() =>
                                  setEditVenueIds((current) => toggleVenueSelection(current, venue.id))
                                }
                              />
                              {getVenueDisplayName(venue)}
                            </label>
                          ))}
                      </div>
                      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Geo targeting (optional)</p>
                      <input value={editTargetCitiesText} onChange={(event) => setEditTargetCitiesText(event.target.value)} placeholder="Cities (comma-separated)" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
                      <input value={editTargetZipCodesText} onChange={(event) => setEditTargetZipCodesText(event.target.value)} placeholder="ZIP codes (comma-separated)" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
                      <input value={editTargetCountiesText} onChange={(event) => setEditTargetCountiesText(event.target.value)} placeholder="Counties (comma-separated)" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
                      <input value={editTargetStatesText} onChange={(event) => setEditTargetStatesText(event.target.value)} placeholder="States (e.g. NY, CA)" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
                      <input value={editTargetRegionsText} onChange={(event) => setEditTargetRegionsText(event.target.value)} placeholder="Regions (NORTHEAST, MIDWEST, SOUTH, WEST)" className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Advertiser Name</label>
                    <input
                      value={editAdvertiserName}
                      onChange={(event) => setEditAdvertiserName(event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Replace Ad Image (Optional)
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        void handleEditAdImageSelection(event);
                      }}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-slate-500">
                      Allowed: JPG, PNG, WebP. Max size: 300KB. 9:16 is ideal, but other ratios now auto-fit.
                    </p>
                    {editAdImageDetails ? <p className="text-xs text-emerald-700">{editAdImageDetails}</p> : null}
                    <p className="break-all text-[11px] text-slate-500">Current URL: {editImageUrl}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Click URL</label>
                    <input
                      value={editClickUrl}
                      onChange={(event) => setEditClickUrl(event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Alt Text</label>
                    <input
                      value={editAltText}
                      onChange={(event) => setEditAltText(event.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Image Width (px)</label>
                      <input
                        type="number"
                        min={1}
                        value={editWidth}
                        onChange={(event) => setEditWidth(Number(event.target.value))}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Image Height (px)</label>
                      <input
                        type="number"
                        min={1}
                        value={editHeight}
                        onChange={(event) => setEditHeight(Number(event.target.value))}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Frequency Interval (N)</label>
                      <input
                        type="number"
                        min={1}
                        max={999}
                        value={editFrequencyInterval}
                        onChange={(event) => setEditFrequencyInterval(Math.max(1, Number(event.target.value)))}
                        placeholder="1 = every visitor, 3 = every 3rd visitor"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    {editAdType !== "inline" ? (
                      <div className="space-y-1">
                        <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Dismiss Delay (seconds)</label>
                        <input
                          type="number"
                          min={0}
                          max={300}
                          value={editDismissDelaySeconds}
                          onChange={(event) => setEditDismissDelaySeconds(Number(event.target.value))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                    ) : null}
                    {editAdType !== "inline" ? (
                      <div className="space-y-1 sm:col-span-2">
                        <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Popup Cooldown (seconds)</label>
                        <input
                          type="number"
                          min={0}
                          max={86400}
                          value={editPopupCooldownSeconds}
                          onChange={(event) => setEditPopupCooldownSeconds(Number(event.target.value))}
                          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                    ) : null}
                  </div>
                  <p className="text-xs text-slate-500">Frequency interval: 1 = every visitor, 3 = every 3rd visitor, etc.</p>
                  <p className="text-xs text-slate-500">
                    Venue targeting: leave all unchecked for all venues, or search and select specific venues.
                  </p>
                  <p className="text-xs text-slate-500">
                    Recommended for <span className="font-semibold">{editSlot}</span>: {getRecommendedSlotSize(editSlot).width}x
                    {getRecommendedSlotSize(editSlot).height}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">Start Date / Time</label>
                      <input
                        type="datetime-local"
                        value={editStartDate}
                        onChange={(event) => setEditStartDate(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium uppercase tracking-wide text-slate-600">End Date / Time (Optional)</label>
                      <input
                        type="datetime-local"
                        value={editEndDate}
                        onChange={(event) => setEditEndDate(event.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(event) => setEditActive(event.target.checked)}
                    />
                    Active
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={editIsPlaceholderAd}
                      onChange={(event) => setEditIsPlaceholderAd(event.target.checked)}
                    />
                    Placeholder ad (fallback only)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void saveAdEdit();
                      }}
                      disabled={isUploadingEditAdImage}
                      className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                    >
                      {isUploadingEditAdImage ? "Uploading..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAdId(null);
                        if (typeof window !== "undefined") {
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }
                      }}
                      className="rounded-md bg-slate-500 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="break-words font-medium">{item.advertiserName}</p>
                  <p className="break-words text-xs text-slate-600">
                    {AD_PAGE_LABEL[item.pageKey]} | {AD_TYPE_LABEL[item.adType]} | {AD_TRIGGER_LABEL[item.displayTrigger]} | {item.slot} | {item.width}x{item.height} | Every {item.frequencyInterval ?? 1} visitor{(item.frequencyInterval ?? 1) !== 1 ? "s" : ""} | {item.active ? "active" : "inactive"}{item.isPlaceholder ? " | placeholder" : ""} |{" "}
                    {item.targetAllVenues
                      ? "all venues"
                      : (item.venueIds ?? (item.venueId ? [item.venueId] : [])).length > 0
                      ? `${(item.venueIds ?? (item.venueId ? [item.venueId] : [])).length} venue(s)`
                      : "global"}
                  </p>
                  {(item.targetCities?.length ?? 0) > 0 ||
                  (item.targetZipCodes?.length ?? 0) > 0 ||
                  (item.targetCounties?.length ?? 0) > 0 ||
                  (item.targetStates?.length ?? 0) > 0 ||
                  (item.targetRegions?.length ?? 0) > 0 ? (
                    <p className="break-words text-xs text-slate-500">
                      Geo: {item.targetCities?.length ? `Cities ${item.targetCities.join(", ")} ` : ""}
                      {item.targetZipCodes?.length ? `ZIP ${item.targetZipCodes.join(", ")} ` : ""}
                      {item.targetCounties?.length ? `Counties ${item.targetCounties.join(", ")} ` : ""}
                      {item.targetStates?.length ? `States ${item.targetStates.join(", ")} ` : ""}
                      {item.targetRegions?.length ? `Regions ${item.targetRegions.join(", ")}` : ""}
                    </p>
                  ) : null}
                  {item.adType === "inline" ? (
                    <p className="break-words text-xs text-slate-500">
                      Inline variant: {item.sequenceIndex ?? 1} | Placement: {item.placementKey ?? "default"}
                    </p>
                  ) : null}
                  {item.adType === "popup" && item.displayTrigger === "round-end" ? (
                    <p className="break-words text-xs text-slate-500">
                      Trivia round: {item.roundNumber ?? "all"} | Placement: {item.placementKey ?? "default"}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    Dismiss delay: {item.dismissDelaySeconds ?? 3}s | Popup cooldown: {item.popupCooldownSeconds ?? 180}s
                  </p>
                  <p className="text-xs text-slate-500">
                    Impressions: {item.impressions ?? 0} | Clicks: {item.clicks ?? 0} | CTR:{" "}
                    {item.impressions && item.impressions > 0
                      ? `${(((item.clicks ?? 0) / item.impressions) * 100).toFixed(2)}%`
                      : "0.00%"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => beginEditAd(item)}
                      className="rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void simulateAdEvent(item.id, "impression");
                      }}
                      className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                    >
                      Test Impression
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void simulateAdEvent(item.id, "click");
                      }}
                      className="rounded-md bg-indigo-700 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                    >
                      Test Click
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteItem("ads", item.id);
                      }}
                      className="rounded-md bg-rose-700 px-3 py-2 text-sm font-medium text-white sm:py-1.5 sm:text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
      ) : null}

      {shouldRenderSectionContent && activeSection === "challenge-campaigns" ? (
      <section className="space-y-3 rounded-lg border border-slate-200 p-3">
        <h2 className="text-base font-semibold text-slate-900">Challenge Manager</h2>
        <p className="text-sm text-slate-700">Create and manage venue challenge campaigns and view live progress.</p>

        <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {editingChallengeCampaignId ? "Edit Challenge Campaign" : "Create Challenge Campaign"}
            </h3>
            <div className="grid gap-3 lg:grid-cols-2">
            <label className={FORM_LABEL_CLASS}>
              Name
              <input
                value={challengeName}
                onChange={(event) => setChallengeName(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>
            <label className={FORM_LABEL_CLASS}>
              Image URL
              <input
                value={challengeImageUrl}
                onChange={(event) => {
                  setChallengeImageUrl(event.target.value);
                  setChallengeImageRemoved(false);
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"
              />
            </label>
            <label className={`${FORM_LABEL_CLASS} lg:col-span-2`}>
              Rules
              <textarea
                value={challengeRules}
                onChange={(event) => setChallengeRules(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm"
                rows={8}
              />
            </label>
            </div>
            <label className={FORM_LABEL_CLASS}>
              Upload Challenge Image
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsChallengeDropActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsChallengeDropActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsChallengeDropActive(false);
                  const droppedFile = event.dataTransfer.files?.[0] ?? null;
                  acceptChallengeImageFile(droppedFile);
                }}
                className={`mt-1 rounded-md border-2 border-dashed px-3 py-4 text-center text-xs ${
                  isChallengeDropActive ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white"
                }`}
              >
                Drag & drop image here, or choose file below
              </div>
              <input
                type="file"
                accept="image/png,image/webp,image/svg+xml"
                onChange={(event) => {
                  void handleChallengeImageSelection(event);
                }}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-xs"
              />
              <span className="mt-1 block text-[11px] font-medium normal-case text-slate-500">
                PNG/WebP/SVG only (transparent-friendly). Max 1MB.
              </span>
            </label>
            {(challengeImagePreviewUrl || challengeImageUrl) && !challengeImageRemoved ? (
              <button
                type="button"
                onClick={() => {
                  setChallengeImageRemoved(true);
                  setChallengeImageUrl("");
                  setChallengeImageFile(null);
                  setChallengeImageDetails("");
                  setChallengeImagePreviewUrl("");
                }}
                className="w-fit rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                Delete Image
              </button>
            ) : null}
            {challengeImageDetails ? (
              <p className="text-xs text-slate-600">{challengeImageDetails}</p>
            ) : null}
            <div className="rounded-[1.2rem] border-[3px] border-[#0f172a]/80 bg-[linear-gradient(146deg,#0f766e_0%,#06b6d4_50%,#22d3ee_100%)] p-4 shadow-[0_8px_0_rgba(15,23,42,0.35)]">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.08em] text-cyan-50/90">Live Card Preview</p>
                <label className="flex items-center gap-2 text-[11px] font-medium text-cyan-50/95">
                  <input
                    type="checkbox"
                    checked={challengePreviewCheckerboard}
                    onChange={(event) => setChallengePreviewCheckerboard(event.target.checked)}
                  />
                  Checkerboard
                </label>
              </div>
              <div
                className="rounded-[1rem] p-2"
                style={
                  challengePreviewCheckerboard
                    ? {
                        backgroundImage:
                          "linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)",
                        backgroundSize: "16px 16px",
                        backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
                      }
                    : undefined
                }
              >
                <div className="relative flex w-full items-center gap-3 overflow-hidden rounded-[1.2rem] border-[3px] border-[#0f172a]/80 bg-[linear-gradient(146deg,#0f766e_0%,#06b6d4_50%,#22d3ee_100%)] p-3 text-left shadow-[0_8px_0_rgba(15,23,42,0.35)]">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_10%,rgba(254,240,138,0.35)_0%,rgba(254,240,138,0)_34%)]" />
                  <div
                    className="relative inline-flex aspect-square w-[28%] min-w-[72px] max-w-[92px] shrink-0 items-center justify-center overflow-visible rounded-xl border-0 bg-transparent p-3 shadow-none"
                    style={{ background: "none" }}
                  >
                    {(challengeImagePreviewUrl || challengeImageUrl) ? (
                      <div
                        className="h-full w-full"
                        role="img"
                        aria-label={challengeName || "Challenge preview"}
                        style={{
                          backgroundImage: `url(${challengeImagePreviewUrl || challengeImageUrl})`,
                          backgroundSize: challengeImageFit,
                          backgroundPosition: "50% 50%",
                          backgroundRepeat: "no-repeat",
                          backgroundColor: "transparent",
                          transform: `scale(${challengeImageScale})`,
                          transformOrigin: "center",
                        }}
                      />
                    ) : (
                      <span className="text-2xl">🏆</span>
                    )}
                    {[
                      { key: "tl", className: "absolute -left-1 -top-1 cursor-nwse-resize" },
                      { key: "tr", className: "absolute -right-1 -top-1 cursor-nesw-resize" },
                      { key: "bl", className: "absolute -bottom-1 -left-1 cursor-nesw-resize" },
                      { key: "br", className: "absolute -bottom-1 -right-1 cursor-nwse-resize" },
                    ].map((handle) => (
                      <button
                        key={handle.key}
                        type="button"
                        aria-label="Resize challenge image"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          challengePreviewResizeRef.current = {
                            active: true,
                            startX: event.clientX,
                            startY: event.clientY,
                            startScale: challengeImageScale,
                          };
                        }}
                        className={`${handle.className} z-10 h-4 w-4 rounded-sm border border-cyan-100/80 bg-cyan-300/30`}
                      />
                    ))}
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <div className="truncate text-sm font-black uppercase tracking-[0.08em] text-cyan-50">
                      {challengeName.trim() || "Challenge Name"}
                    </div>
                    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-950/35">
                      <div className="h-full w-[45%] rounded-full bg-amber-300" />
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-cyan-50/95">45 / {Math.max(1, Number(challengePointsRequired || "100"))} points</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              <label className={FORM_LABEL_CLASS}>
                Image Fit
                <select
                  value={challengeImageFit}
                  onChange={(event) => setChallengeImageFit(event.target.value as "cover" | "contain")}
                  className={`${FORM_SELECT_CLASS} mt-1 w-full text-sm`}
                >
                  <option value="cover">Cover (fill card)</option>
                  <option value="contain">Contain (show full image)</option>
                </select>
              </label>
              <div className="flex items-end">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Direct Resize Scale: {challengeImageScale.toFixed(2)}x
                </p>
              </div>
            </div>

            <div>
              <p className={FORM_LABEL_CLASS}>Target Venues</p>
              <input
                value={challengeVenueSearch}
                onChange={(event) => setChallengeVenueSearch(event.target.value)}
                placeholder="Search venues…"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {availableVenues
                  .filter((venue) =>
                    !challengeVenueSearch.trim() ||
                    getVenueDisplayName(venue).toLowerCase().includes(challengeVenueSearch.trim().toLowerCase())
                  )
                  .map((venue) => (
                  <label key={venue.id} className="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1 text-xs">
                    <input
                      type="checkbox"
                      checked={challengeVenueIds.includes(venue.id)}
                      onChange={() =>
                        setChallengeVenueIds((current) =>
                          current.includes(venue.id) ? current.filter((item) => item !== venue.id) : [...current, venue.id]
                        )
                      }
                    />
                    <span>{getVenueDisplayName(venue)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className={FORM_LABEL_CLASS}>Active Days</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {CHALLENGE_ACTIVE_DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() =>
                      setChallengeActiveDays((current) =>
                        current.includes(day) ? current.filter((item) => item !== day) : [...current, day]
                      )
                    }
                    className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                      challengeActiveDays.includes(day) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {day.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className={FORM_LABEL_CLASS}>Game Types</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {CHALLENGE_GAME_TYPES.map((gameType) => (
                  <button
                    key={gameType}
                    type="button"
                    onClick={() =>
                      setChallengeGameTypes((current) =>
                        current.includes(gameType) ? current.filter((item) => item !== gameType) : [...current, gameType]
                      )
                    }
                    className={`rounded-full border px-2 py-1 text-xs font-semibold ${
                      challengeGameTypes.includes(gameType) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {gameType}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className={FORM_LABEL_CLASS}>
                Start Time
                <input
                  type="time"
                  value={challengeStartTime}
                  onChange={(event) => setChallengeStartTime(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className={FORM_LABEL_CLASS}>
                End Time
                <input
                  type="time"
                  value={challengeEndTime}
                  onChange={(event) => setChallengeEndTime(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className={FORM_LABEL_CLASS}>
                End Date
                <input
                  type="date"
                  value={challengeEndDate}
                  onChange={(event) => setChallengeEndDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className={FORM_LABEL_CLASS}>
                Recurring Type
                <select
                  value={challengeRecurringType}
                  onChange={(event) => setChallengeRecurringType(event.target.value as CampaignRecurringType)}
                  className={`${FORM_SELECT_CLASS} mt-1 w-full text-sm`}
                >
                  {CHALLENGE_RECURRING_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className={FORM_LABEL_CLASS}>
                Point Multiplier
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={challengePointMultiplier}
                  onChange={(event) => setChallengePointMultiplier(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className={FORM_LABEL_CLASS}>
                Points Required
                <input
                  type="number"
                  min="1"
                  value={challengePointsRequired}
                  onChange={(event) => setChallengePointsRequired(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={challengeIsActive}
                onChange={(event) => setChallengeIsActive(event.target.checked)}
              />
              Active campaign
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void submitChallengeCampaign()}
                disabled={isUploadingChallengeImage}
                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white"
              >
                {isUploadingChallengeImage
                  ? "Uploading image..."
                  : editingChallengeCampaignId
                  ? "Update Campaign"
                  : "Create Campaign"}
              </button>
              {editingChallengeCampaignId ? (
                <button
                  type="button"
                  onClick={resetChallengeForm}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
            {challengeFormMessage ? (
              <p className="text-xs font-medium text-emerald-700">{challengeFormMessage}</p>
            ) : null}
          </div>

          <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-slate-900">Campaigns</h3>
            {challengeCampaigns.length === 0 ? (
              <p className="text-sm text-slate-600">No challenge campaigns created yet.</p>
            ) : (
              <ul className="space-y-2">
                {challengeCampaigns.map((campaign) => (
                  <li key={campaign.id} className="rounded border border-slate-200 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedChallengeCampaignId(campaign.id)}
                        className="text-left"
                      >
                        <p className="text-sm font-semibold text-slate-900">{campaign.name}</p>
                        <p className="text-xs text-slate-500">
                          {campaign.isActive ? "Active" : "Inactive"} · Multiplier {campaign.pointMultiplier}x · Target {campaign.pointsRequiredToWin} pts
                        </p>
                      </button>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => beginEditChallengeCampaign(campaign)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteChallengeCampaignItem(campaign.id)}
                          className="rounded bg-rose-700 px-2 py-1 text-xs font-semibold text-white"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Campaign Progress</h3>
            <button
              type="button"
              onClick={() => void loadChallengeProgress()}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              disabled={!selectedChallengeCampaign}
            >
              Refresh
            </button>
          </div>
          {selectedChallengeCampaign ? (
            <p className="mb-2 text-xs text-slate-600">
              Showing progress for <span className="font-semibold text-slate-900">{selectedChallengeCampaign.name}</span>.
            </p>
          ) : (
            <p className="mb-2 text-xs text-slate-600">Select a campaign to view progress.</p>
          )}
          {challengeProgress.length === 0 ? (
            <p className="text-sm text-slate-600">No progress yet for this campaign.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-2 py-1">User ID</th>
                    <th className="px-2 py-1">Venue</th>
                    <th className="px-2 py-1">Points</th>
                    <th className="px-2 py-1">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {challengeProgress
                    .slice()
                    .sort((a, b) => b.pointsEarned - a.pointsEarned)
                    .map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="px-2 py-1 font-mono text-slate-700">{row.userId}</td>
                        <td className="px-2 py-1 font-mono text-slate-700">{row.venueId}</td>
                        <td className="px-2 py-1 font-semibold text-slate-900">{row.pointsEarned}</td>
                        <td className="px-2 py-1 text-slate-600">{new Date(row.updatedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      ) : null}
    </div>
  );
}
