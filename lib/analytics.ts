"use client";

import { getUserId, getVenueId } from "@/lib/storage";
import type {
  CameraPermissionState,
  StoryCameraErrorCode,
  StoryExternalAppTarget,
  StoryShareFallbackMode,
  StoryShareGameType,
  StorySharePipelineStatus,
  StoryShareTemplateVariant,
} from "@/lib/socialShare/contracts";

export type AnalyticsConsent = "granted" | "denied";
export type GameAnalyticsType = "trivia" | "bingo" | "pickem" | "fantasy" | "speed-trivia" | "live-trivia" | "category-blitz";
export type GameOutcome = "won" | "lost" | "abandoned";
export type StoryShareAnalyticsEventName =
  | "story_share_opened"
  | "story_camera_permission_result"
  | "story_capture_completed"
  | "story_share_attempted"
  | "story_share_completed"
  | "story_share_fallback_used";

export interface StoryShareAnalyticsContext {
  storyShareId: string;
  gameType: StoryShareGameType;
  templateVariant?: StoryShareTemplateVariant | null;
  finalRank?: number | null;
  finalPoints?: number | null;
  correctRate?: number | null;
  isChampion?: boolean | null;
  venueId?: string;
  userId?: string;
}

interface StoryShareAnalyticsEventInput extends StoryShareAnalyticsContext {
  eventName: StoryShareAnalyticsEventName;
  fallbackMode?: StoryShareFallbackMode | null;
  externalAppTarget?: StoryExternalAppTarget | null;
  shareStatus?: StorySharePipelineStatus | null;
  permissionState?: CameraPermissionState | null;
  cameraErrorCode?: StoryCameraErrorCode | null;
  fallbackRecommended?: boolean | null;
  resultReason?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  usedCameraFallback?: boolean | null;
}

type QueuedEvent = {
  requestId: string;
  type: string;
  occurredAt: string;
  userId?: string;
  venueId?: string;
  sessionId?: string;
  userSessionId?: string | null;
  gameSessionId?: string;
  gameType?: GameAnalyticsType;
  outcome?: GameOutcome;
  interactionId?: string;
  interactionType?: "view" | "click" | "convert";
  adId?: string;
  adCampaignId?: string | null;
  referrerPage?: string | null;
  zipCode?: string | null;
  city?: string | null;
  stateCode?: string | null;
  regionKey?: string | null;
  country?: string | null;
  dataSource?: "geolocation" | "signup";
  storyShareId?: string;
  templateVariant?: StoryShareTemplateVariant | null;
  fallbackMode?: StoryShareFallbackMode | null;
  externalAppTarget?: StoryExternalAppTarget | null;
  shareStatus?: StorySharePipelineStatus | null;
  permissionState?: CameraPermissionState | null;
  cameraErrorCode?: StoryCameraErrorCode | null;
  finalRank?: number | null;
  finalPoints?: number | null;
  correctRate?: number | null;
  isChampion?: boolean | null;
  fallbackRecommended?: boolean | null;
  resultReason?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  usedCameraFallback?: boolean | null;
};

type StoredSiteSession = {
  sessionId: string;
  userId: string;
  venueId: string;
  startedAt: number;
};

type StoredGameSession = {
  sessionId: string;
  gameType: GameAnalyticsType;
  path: string;
  startedAt: number;
};

const CONSENT_KEY = "tp:analytics-consent";
const QUEUE_KEY = "tp:analytics-queue:v1";
const SITE_SESSION_KEY = "tp:analytics-site-session:v1";
const GAME_SESSION_KEY = "tp:analytics-game-session:v1";
const GEO_REFRESH_PREFIX = "tp:analytics-geo-last:";
const AD_DEDUPE_PREFIX = "tp:analytics-ad:";
const FLUSH_INTERVAL_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const GEO_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_QUEUE_LENGTH = 200;
const MAX_BATCH_SIZE = 25;

let flushTimer: number | null = null;
let heartbeatTimer: number | null = null;
let initialized = false;
let flushInFlight = false;

function storageGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage can fail in private browsing; analytics should never block UX.
  }
}

function sessionRemove(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function localGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function localSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures.
  }
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) =>
    (Number(char) ^ ((Math.random() * 16) >> (Number(char) / 4))).toString(16)
  );
}

export function createStoryShareAnalyticsId(): string {
  return uuid();
}

function nowIso(): string {
  return new Date().toISOString();
}

function getStoredConsent(): AnalyticsConsent | null {
  const value = localGet(CONSENT_KEY);
  return value === "granted" || value === "denied" ? value : null;
}

export function getAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  return getStoredConsent();
}

export function setAnalyticsConsent(consent: AnalyticsConsent) {
  if (typeof window === "undefined") return;
  if (consent === "denied") {
    void endCurrentGameSession("abandoned", true);
    void endCurrentSiteSession(true);
    sessionRemove(QUEUE_KEY);
    localSet(CONSENT_KEY, consent);
  } else {
    localSet(CONSENT_KEY, consent);
    ensureSiteSession();
  }
}

function analyticsEnabled(): boolean {
  return typeof window !== "undefined";
}

function readQueue(): QueuedEvent[] {
  const raw = sessionGet(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((event) => event && typeof event === "object") as QueuedEvent[] : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEvent[]) {
  sessionSet(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_LENGTH)));
}

function enqueue(event: Omit<QueuedEvent, "requestId" | "occurredAt" | "userId" | "venueId"> & Partial<QueuedEvent>) {
  if (!analyticsEnabled()) return;
  const userId = (event.userId ?? getUserId() ?? "").trim();
  const venueId = (event.venueId ?? getVenueId() ?? "").trim();
  if (!venueId && event.type !== "session_end" && event.type !== "game_end") return;

  const queue = readQueue();
  queue.push({
    ...event,
    requestId: event.requestId ?? uuid(),
    occurredAt: event.occurredAt ?? nowIso(),
    userId: userId || undefined,
    venueId: venueId || undefined,
  });
  writeQueue(queue);
}

function readSiteSession(): StoredSiteSession | null {
  const raw = sessionGet(SITE_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSiteSession;
    return parsed?.sessionId && parsed?.userId && parsed?.venueId ? parsed : null;
  } catch {
    return null;
  }
}

function writeSiteSession(session: StoredSiteSession) {
  sessionSet(SITE_SESSION_KEY, JSON.stringify(session));
}

function readGameSession(): StoredGameSession | null {
  const raw = sessionGet(GAME_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredGameSession;
    return parsed?.sessionId && parsed?.gameType ? parsed : null;
  } catch {
    return null;
  }
}

function writeGameSession(session: StoredGameSession) {
  sessionSet(GAME_SESSION_KEY, JSON.stringify(session));
}

export function ensureSiteSession() {
  if (!analyticsEnabled()) return null;
  const userId = (getUserId() ?? "").trim();
  const venueId = (getVenueId() ?? "").trim();
  if (!userId || !venueId) return null;

  const existing = readSiteSession();
  if (existing?.userId === userId && existing.venueId === venueId) return existing;

  const next = { sessionId: uuid(), userId, venueId, startedAt: Date.now() };
  writeSiteSession(next);
  enqueue({
    type: "session_start",
    sessionId: next.sessionId,
    userId,
    venueId,
  });
  scheduleFlush();
  return next;
}

export function heartbeatSiteSession() {
  if (document.hidden) return;
  const session = ensureSiteSession();
  if (!session) return;
  enqueue({
    type: "session_heartbeat",
    sessionId: session.sessionId,
    userId: session.userId,
    venueId: session.venueId,
  });
}

export function endCurrentSiteSession(useBeacon = false) {
  const session = readSiteSession();
  if (!session) return;
  enqueue({
    type: "session_end",
    sessionId: session.sessionId,
    userId: session.userId,
    venueId: session.venueId,
  });
  sessionRemove(SITE_SESSION_KEY);
  if (useBeacon) {
    flushAnalytics(true);
  } else {
    void flushAnalytics();
  }
}

export function startGameSession(gameType: GameAnalyticsType, path = window.location.pathname) {
  if (!analyticsEnabled()) return null;
  const siteSession = ensureSiteSession();
  const userId = (getUserId() ?? "").trim();
  const venueId = (getVenueId() ?? "").trim();
  if (!userId || !venueId) return null;

  const existing = readGameSession();
  if (existing?.gameType === gameType && existing.path === path) return existing;
  if (existing) endCurrentGameSession("abandoned");

  const next = { sessionId: uuid(), gameType, path, startedAt: Date.now() };
  writeGameSession(next);
  enqueue({
    type: "game_start",
    gameSessionId: next.sessionId,
    userSessionId: siteSession?.sessionId ?? null,
    gameType,
    userId,
    venueId,
  });
  scheduleFlush();
  return next;
}

export function endCurrentGameSession(outcome: GameOutcome = "abandoned", useBeacon = false) {
  const session = readGameSession();
  if (!session) return;
  enqueue({
    type: "game_end",
    gameSessionId: session.sessionId,
    gameType: session.gameType,
    outcome,
  });
  sessionRemove(GAME_SESSION_KEY);
  if (useBeacon) {
    flushAnalytics(true);
  } else {
    void flushAnalytics();
  }
}

export function trackAdView(params: { adId: string; adCampaignId?: string | null; referrerPage?: string | null }) {
  const adId = params.adId.trim();
  if (!adId) return;
  const dedupeKey = `${AD_DEDUPE_PREFIX}view:${adId}:${window.location.pathname}`;
  const seen = Number.parseInt(sessionGet(dedupeKey) ?? "0", 10);
  const now = Date.now();
  if (Number.isFinite(seen) && seen > 0 && now - seen < 30 * 60 * 1000) return;
  sessionSet(dedupeKey, String(now));
  enqueue({
    type: "ad_interaction",
    interactionId: uuid(),
    adId,
    adCampaignId: params.adCampaignId ?? null,
    interactionType: "view",
    referrerPage: params.referrerPage ?? window.location.pathname,
  });
}

export function trackAdClick(params: { adId: string; adCampaignId?: string | null; referrerPage?: string | null }, useBeacon = false) {
  const adId = params.adId.trim();
  if (!adId) return;
  const requestId = uuid();
  enqueue({
    type: "ad_interaction",
    requestId,
    interactionId: uuid(),
    adId,
    adCampaignId: params.adCampaignId ?? null,
    interactionType: "click",
    referrerPage: params.referrerPage ?? window.location.pathname,
  });
  if (useBeacon) flushAnalytics(true);
}

export function syncUserGeographicData(input: {
  zipCode?: string | null;
  city?: string | null;
  stateCode?: string | null;
  regionKey?: string | null;
  country?: string | null;
  dataSource?: "geolocation" | "signup";
}) {
  const userId = (getUserId() ?? "").trim();
  if (!analyticsEnabled() || !userId) return;
  const key = `${GEO_REFRESH_PREFIX}${userId}`;
  const last = Number.parseInt(storageGet(key) ?? "0", 10);
  if (Number.isFinite(last) && last > 0 && Date.now() - last < GEO_REFRESH_MS) return;
  localSet(key, String(Date.now()));
  enqueue({
    type: "geo_sync",
    userId,
    zipCode: input.zipCode ?? null,
    city: input.city ?? null,
    stateCode: input.stateCode ?? null,
    regionKey: input.regionKey ?? null,
    country: input.country ?? "US",
    dataSource: input.dataSource ?? "signup",
  });
  scheduleFlush();
}

function enqueueStoryShareEvent(input: StoryShareAnalyticsEventInput) {
  const storyShareId = input.storyShareId.trim();
  if (!storyShareId) return;

  enqueue({
    type: input.eventName,
    gameType: input.gameType,
    userId: input.userId,
    venueId: input.venueId,
    storyShareId,
    templateVariant: input.templateVariant ?? null,
    fallbackMode: input.fallbackMode ?? null,
    externalAppTarget: input.externalAppTarget ?? null,
    shareStatus: input.shareStatus ?? null,
    permissionState: input.permissionState ?? null,
    cameraErrorCode: input.cameraErrorCode ?? null,
    finalRank: input.finalRank ?? null,
    finalPoints: input.finalPoints ?? null,
    correctRate: input.correctRate ?? null,
    isChampion: input.isChampion ?? null,
    fallbackRecommended: input.fallbackRecommended ?? null,
    resultReason: input.resultReason ?? null,
    imageWidth: input.imageWidth ?? null,
    imageHeight: input.imageHeight ?? null,
    usedCameraFallback: input.usedCameraFallback ?? null,
  });
  scheduleFlush();
}

export function trackStoryShareEvent(input: StoryShareAnalyticsEventInput) {
  try {
    enqueueStoryShareEvent(input);
  } catch {
    // Analytics should never block the camera/share flow.
  }
}

export function trackStoryShareOpened(input: StoryShareAnalyticsContext) {
  trackStoryShareEvent({ ...input, eventName: "story_share_opened" });
}

export function trackStoryCameraPermissionResult(
  input: StoryShareAnalyticsContext & {
    permissionState: CameraPermissionState;
    cameraErrorCode?: StoryCameraErrorCode | null;
    usedCameraFallback?: boolean | null;
  }
) {
  trackStoryShareEvent({ ...input, eventName: "story_camera_permission_result" });
}

export function trackStoryCaptureCompleted(
  input: StoryShareAnalyticsContext & {
    imageWidth?: number | null;
    imageHeight?: number | null;
  }
) {
  trackStoryShareEvent({ ...input, eventName: "story_capture_completed" });
}

export function trackStoryShareAttempted(input: StoryShareAnalyticsContext) {
  trackStoryShareEvent({ ...input, eventName: "story_share_attempted" });
}

export function trackStoryShareCompleted(
  input: StoryShareAnalyticsContext & {
    shareStatus: StorySharePipelineStatus;
    fallbackRecommended?: boolean | null;
    resultReason?: string | null;
  }
) {
  trackStoryShareEvent({ ...input, eventName: "story_share_completed" });
}

export function trackStoryShareFallbackUsed(
  input: StoryShareAnalyticsContext & {
    fallbackMode: StoryShareFallbackMode;
    externalAppTarget?: StoryExternalAppTarget | null;
    resultReason?: string | null;
  }
) {
  trackStoryShareEvent({ ...input, eventName: "story_share_fallback_used" });
}

export function flushAnalytics(useBeacon = false): Promise<void> | void {
  if (flushInFlight && !useBeacon) return Promise.resolve();
  const queue = readQueue();
  if (queue.length === 0) return Promise.resolve();
  const batch = queue.slice(0, MAX_BATCH_SIZE);
  const rest = queue.slice(MAX_BATCH_SIZE);
  const body = JSON.stringify({ events: batch });

  if (useBeacon && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const sent = navigator.sendBeacon("/api/analytics/events", new Blob([body], { type: "application/json" }));
    if (sent) {
      writeQueue(rest);
    }
    return;
  }

  flushInFlight = true;
  return fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  })
    .then((response) => {
      if (response.ok) writeQueue(rest);
    })
    .catch(() => {
      writeQueue([...batch, ...rest]);
    })
    .finally(() => {
      flushInFlight = false;
    });
}

export function gameTypeForPath(pathname: string | null): GameAnalyticsType | null {
  if (!pathname || pathname.startsWith("/admin")) return null;
  if (pathname.startsWith("/trivia/live")) return "live-trivia";
  if (pathname.startsWith("/bingo/home") || pathname.startsWith("/bingo/select")) return "bingo";
  if (pathname.startsWith("/nfl-pickem") || pathname.startsWith("/pickem") || pathname.startsWith("/predictions")) return "pickem";
  if (pathname.startsWith("/category-blitz")) return "category-blitz";
  return null;
}

function scheduleFlush() {
  if (!initialized || flushTimer !== null) return;
  flushTimer = window.setInterval(() => {
    if (!document.hidden) void flushAnalytics();
  }, FLUSH_INTERVAL_MS);
}

export function initializeAnalyticsRuntime() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  ensureSiteSession();
  scheduleFlush();
  heartbeatTimer = window.setInterval(() => {
    heartbeatSiteSession();
  }, HEARTBEAT_INTERVAL_MS);

  const onVisibility = () => {
    if (document.hidden) {
      void flushAnalytics();
      return;
    }
    ensureSiteSession();
    void flushAnalytics();
  };
  const onPageHide = () => {
    endCurrentGameSession("abandoned", true);
    endCurrentSiteSession(true);
  };
  const onOnline = () => {
    void flushAnalytics();
  };

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("online", onOnline);

  window.addEventListener("tp:auth-state-changed", () => {
    ensureSiteSession();
    void flushAnalytics();
  });
  window.addEventListener("tp:auth-state-reset", () => {
    endCurrentGameSession("abandoned", true);
    endCurrentSiteSession(true);
  });
}
