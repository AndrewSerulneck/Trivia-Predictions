"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { PageShell } from "@/components/ui/PageShell";
import {
  createUserProfile,
  ensureAnonymousSession,
  validatePin,
  validateUsername,
} from "@/lib/auth";
import { calculateDistanceMeters, getBestCurrentLocation, getCurrentLocation } from "@/lib/geolocation";
import { saveUserId, saveUsername, saveVenueId } from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getVenueById, listVenues } from "@/lib/venues";
import { writeWarmPredictionsCache, writeWarmTriviaCache } from "@/lib/warmupCache";
import {
  setVenueHomeEntryHandoff,
  writeVenueHomeBootstrap,
  type HomeBadgeCounts,
  type TriviaQuotaSnapshot,
} from "@/lib/venueHomeBootstrap";
import type { LeaderboardEntry, Prediction, TriviaQuestion, Venue } from "@/types";
import { getVenueDisplayName, getVenueVisual as getVenueVisualFromConfig } from "@/lib/venueDisplay";
import { APP_PAGE_NAMES } from "@/lib/pageNames";
import { InlineSlotAdClient } from "@/components/ui/InlineSlotAdClient";

type Status = "idle" | "loading" | "ready" | "saving" | "error";
type JoinPanel = "venue-list" | "venue-login";

type LeaderboardPayload = {
  ok?: boolean;
  entries?: LeaderboardEntry[];
};

type TriviaPayload = {
  ok?: boolean;
  questions?: TriviaQuestion[];
};

type TriviaQuotaPayload = {
  ok?: boolean;
  quota?: TriviaQuotaSnapshot | null;
};

type PredictionsPayload = {
  ok?: boolean;
  items?: Prediction[];
  page?: number;
  pageSize?: number;
  totalItems?: number;
  totalPages?: number;
  sports?: string[];
  leaguesBySport?: Record<string, string[]>;
};

type PrizesPayload = {
  ok?: boolean;
  weeklyPrize?: {
    prizeTitle?: string;
    prizeDescription?: string;
    rewardPoints?: number;
  } | null;
};

type VenuesPayload = {
  ok?: boolean;
  venues?: Venue[];
};

type BingoBadgePayload = {
  ok?: boolean;
  cards?: Array<{ status?: string }>;
};

type PickEmBadgePayload = {
  ok?: boolean;
  picks?: Array<{ status?: string }>;
};

type ChallengesBadgePayload = {
  ok?: boolean;
  challenges?: Array<{
    status?: string;
    receiverUserId?: string;
  }>;
};

function normalizeBooleanEnv(value: string | undefined, fallback = false): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return fallback;
}

const DISABLE_GEOFENCE_FOR_TESTING = normalizeBooleanEnv(process.env.NEXT_PUBLIC_DISABLE_GEOFENCE, false);

const JOIN_BUTTON_POP_CLASS =
  "transition-all duration-150 active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function isLocationPermissionDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === 1;
}

const getVenueVisual = (venue: Venue, index: number) => getVenueVisualFromConfig(venue, index);

const ACCESS_DISTANCE_METERS = 200;

function getGeofenceThresholdMeters(venueRadius: number, accuracy?: number): number {
  const normalizedVenueRadius = Number.isFinite(venueRadius) ? Math.max(0, Math.round(venueRadius)) : 0;
  const baseRadius = Math.max(ACCESS_DISTANCE_METERS, normalizedVenueRadius);
  const accuracyBuffer = Number.isFinite(accuracy) ? Math.min(5000, Math.max(120, Math.round(Number(accuracy) * 1.5))) : 320;
  return baseRadius + accuracyBuffer;
}

const ONBOARDING_PANEL_VARIANTS = {
  enter: (direction: 1 | -1) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 1,
  }),
  center: {
    x: "0%",
    opacity: 1,
  },
  exit: (direction: 1 | -1) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 1,
  }),
};

export function JoinFlow({ initialVenueId }: { initialVenueId: string }) {
  const router = useRouter();
  const venueParam = initialVenueId.trim();
  const [showIntro, setShowIntro] = useState(true);
  const [introFadeOut, setIntroFadeOut] = useState(false);

  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [venue, setVenue] = useState<Venue | null>(null);
  const [venueList, setVenueList] = useState<Venue[]>([]);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [locationVerified, setLocationVerified] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const [lastLocationVerifiedAt, setLastLocationVerifiedAt] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [panelDirection, setPanelDirection] = useState<1 | -1>(1);
  const [activePanel, setActivePanel] = useState<JoinPanel>(venueParam ? "venue-login" : "venue-list");
  const [isScanningQr, setIsScanningQr] = useState(false);
  const [scanNotice, setScanNotice] = useState("");
  const [isOptimisticallyEntering, setIsOptimisticallyEntering] = useState(false);
  const [pendingVenueSelectionId, setPendingVenueSelectionId] = useState<string | null>(null);
  const autoVerificationAttemptedRef = useRef(false);
  const scanVideoRef = useRef<HTMLVideoElement | null>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);
  const scanRafRef = useRef<number | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const introSeen = window.sessionStorage.getItem("tp:intro-played:v1");
    if (introSeen === "1") {
      setShowIntro(false);
      return;
    }

    const fadeTimer = window.setTimeout(() => {
      setIntroFadeOut(true);
    }, 2550);
    const hideTimer = window.setTimeout(() => {
      window.sessionStorage.setItem("tp:intro-played:v1", "1");
      setShowIntro(false);
    }, 3000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      setStatus("loading");
      setErrorMessage("");
      setLocationVerified(false);
      setLastLocationVerifiedAt(null);
      setDistanceMeters(null);
      setLocationNotice("Verifying your location...");
      autoVerificationAttemptedRef.current = false;

      try {
        const venues = await listVenues();
        setVenueList(venues);

        if (!venueParam) {
          setActivePanel("venue-list");
          setStatus("ready");

          if (DISABLE_GEOFENCE_FOR_TESTING) {
            setLocationVerified(true);
            setLocationNotice("Testing mode: location checks are disabled.");
            setVenue(null);
            setLocationLoading(false);
            return;
          }

          setLocationLoading(true);
          try {
            // Quick first-pass location for faster venue discovery UX.
            let current = await getCurrentLocation();
            if (!Number.isFinite(current.accuracy) || (current.accuracy ?? 9999) > 500) {
              current = await getBestCurrentLocation({
                sampleDurationMs: 2800,
                timeoutMs: 5500,
                desiredAccuracyMeters: 220,
              });
            }
            const distanceByVenue = venues.map((item) => {
              const distance = calculateDistanceMeters(current, {
                latitude: item.latitude,
                longitude: item.longitude,
              });
              return { venue: item, distance };
            });
            const sortedByDistance = [...distanceByVenue]
              .sort((a, b) => a.distance - b.distance)
              .map((item) => item.venue);
            const nearbyCount = distanceByVenue.filter(
              (item) => item.distance <= getGeofenceThresholdMeters(item.venue.radius, current.accuracy)
            ).length;
            setVenueList(sortedByDistance);
            if (nearbyCount > 0) {
              setLocationNotice(`Found ${nearbyCount} nearby venue(s).`);
            } else {
              setLocationNotice("Showing all venues. You'll verify location after selecting one.");
            }
          } catch (error) {
            setVenueList(venues);
            if (isLocationPermissionDenied(error)) {
              setLocationNotice("Location permission is off. You can still choose a venue and verify afterward.");
            } else {
              setLocationNotice(
                getErrorMessage(
                  error,
                  "Location check unavailable right now. You can still choose a venue and verify afterward."
                )
              );
            }
          } finally {
            setLocationLoading(false);
          }
          setVenue(null);
          return;
        }

        const venueData = await getVenueById(venueParam);
        if (!venueData) {
          setStatus("error");
          setErrorMessage(`Venue "${venueParam}" was not found.`);
          return;
        }

        setVenue(venueData);
        setActivePanel("venue-login");
        setStatus("ready");

        if (!isSupabaseConfigured) {
          setErrorMessage(
            "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
          );
          return;
        }

        void ensureAnonymousSession();

        if (!DISABLE_GEOFENCE_FOR_TESTING) {
          setLocationLoading(true);
          try {
            let current = await getCurrentLocation();
            if (!Number.isFinite(current.accuracy) || (current.accuracy ?? 9999) > 500) {
              current = await getBestCurrentLocation({
                sampleDurationMs: 2800,
                timeoutMs: 5500,
                desiredAccuracyMeters: 220,
              });
            }
            const distance = calculateDistanceMeters(current, {
              latitude: venueData.latitude,
              longitude: venueData.longitude,
            });
            setDistanceMeters(distance);
            const allowedDistance = getGeofenceThresholdMeters(venueData.radius, current.accuracy);
            if (distance <= allowedDistance) {
              setLocationVerified(true);
              setLastLocationVerifiedAt(Date.now());
              setLocationNotice("");
            } else {
              setLocationVerified(false);
              setLastLocationVerifiedAt(null);
              setLocationNotice("");
              setErrorMessage(`You are ${Math.round(distance)}m away. Required range is ${Math.round(allowedDistance)}m.`);
            }
          } catch (error) {
            setLocationVerified(false);
            setLastLocationVerifiedAt(null);
            setLocationNotice("");
            if (isLocationPermissionDenied(error)) {
              setErrorMessage("Sorry, you must share your location in order to play!");
            } else {
              setErrorMessage(getErrorMessage(error, "Unable to verify location."));
            }
          } finally {
            setLocationLoading(false);
          }
        } else {
          setLocationVerified(true);
          setLastLocationVerifiedAt(Date.now());
          setLocationNotice("");
        }
      } catch (error) {
        setStatus("error");
        setErrorMessage(getErrorMessage(error, "Failed to initialize join flow."));
      }
    };

    void load();
  }, [venueParam]);

  const verifyVenueAccess = useCallback(
    async (selectedVenue: Venue) => {
      if (DISABLE_GEOFENCE_FOR_TESTING) {
        setLocationLoading(false);
        setLocationVerified(true);
        setLastLocationVerifiedAt(Date.now());
        setLocationNotice("Testing mode: location checks are disabled.");
        setDistanceMeters(null);
        setErrorMessage("");
        return;
      }

      setLocationLoading(true);
      setLocationNotice("Verifying your location...");
      try {
        let current = await getCurrentLocation();
        if (!Number.isFinite(current.accuracy) || (current.accuracy ?? 9999) > 500) {
          current = await getBestCurrentLocation({
            sampleDurationMs: 2800,
            timeoutMs: 5500,
            desiredAccuracyMeters: 220,
          });
        }

        const distance = calculateDistanceMeters(current, {
          latitude: selectedVenue.latitude,
          longitude: selectedVenue.longitude,
        });
        const allowedDistance = getGeofenceThresholdMeters(selectedVenue.radius, current.accuracy);

        setDistanceMeters(distance);
        if (distance <= allowedDistance) {
          setLocationVerified(true);
          setLastLocationVerifiedAt(Date.now());
          setLocationNotice("");
          setErrorMessage("");
          return;
        }

        setLocationVerified(false);
        setLastLocationVerifiedAt(null);
        setLocationNotice("");
        setErrorMessage(`You are ${Math.round(distance)}m away. Required range is ${Math.round(allowedDistance)}m.`);
      } catch (error) {
        setLocationVerified(false);
        setLastLocationVerifiedAt(null);
        setLocationNotice("");
        if (isLocationPermissionDenied(error)) {
          setErrorMessage("Sorry, you must share your location in order to play!");
        } else {
          setErrorMessage(getErrorMessage(error, "Unable to verify location."));
        }
      } finally {
        setLocationLoading(false);
      }
    },
    []
  );

  const handleSelectVenue = useCallback(
    (selectedVenue: Venue) => {
      setPanelDirection(1);
      setActivePanel("venue-login");
      setPendingVenueSelectionId(selectedVenue.id);
      setVenue(selectedVenue);
      setErrorMessage("");
      setUsername("");
      setPin("");
      setIsTransitioning(false);
      setIsOptimisticallyEntering(false);
      setStatus("ready");

      if (isSupabaseConfigured) {
        void ensureAnonymousSession();
      }

      void verifyVenueAccess(selectedVenue).finally(() => {
        setPendingVenueSelectionId((current) => (current === selectedVenue.id ? null : current));
      });
    },
    [verifyVenueAccess]
  );

  const handleBackToVenueList = useCallback(() => {
    setPanelDirection(-1);
    setActivePanel("venue-list");
    setVenue(null);
    setErrorMessage("");
    setIsTransitioning(false);
    setIsOptimisticallyEntering(false);
    setPendingVenueSelectionId(null);
  }, []);

  const canCreate = useMemo(() => {
    return Boolean(
      isSupabaseConfigured &&
        venue &&
        validateUsername(username) &&
        validatePin(pin) &&
        locationVerified &&
        !locationLoading &&
        !isTransitioning
    );
  }, [isTransitioning, locationLoading, locationVerified, venue, username, pin]);

  const openAdminDashboard = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.assign("/admin");
      return;
    }
    router.push("/admin");
  }, [router]);

  const stopScanLoop = useCallback(() => {
    if (scanRafRef.current) {
      window.cancelAnimationFrame(scanRafRef.current);
      scanRafRef.current = null;
    }
    if (scanStreamRef.current) {
      for (const track of scanStreamRef.current.getTracks()) {
        track.stop();
      }
      scanStreamRef.current = null;
    }
    if (scanVideoRef.current) {
      scanVideoRef.current.srcObject = null;
    }
    scanCanvasRef.current = null;
  }, []);

  const routeFromQrPayload = useCallback(
    (value: string): boolean => {
      const raw = value.trim();
      if (!raw) {
        return false;
      }

      if (/^venue-[a-z0-9-]+$/i.test(raw)) {
        router.push(`/?v=${encodeURIComponent(raw)}`);
        return true;
      }

      try {
        const parsed = new URL(raw, window.location.origin);
        const venueQuery = parsed.searchParams.get("v")?.trim();
        if (venueQuery) {
          router.push(`/?v=${encodeURIComponent(venueQuery)}`);
          return true;
        }
        const venuePathMatch = parsed.pathname.match(/^\/venue\/([^/?#]+)/i);
        if (venuePathMatch?.[1]) {
          router.push(`/?v=${encodeURIComponent(venuePathMatch[1])}`);
          return true;
        }
      } catch {
        return false;
      }

      return false;
    },
    [router]
  );

  const startQrScan = useCallback(async () => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return;
    }
    setScanNotice("");
    setIsScanningQr(true);
    stopScanLoop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });
      scanStreamRef.current = stream;
      let mountAttempts = 0;
      while (!scanVideoRef.current && mountAttempts < 12) {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
        mountAttempts += 1;
      }
      if (!scanVideoRef.current) {
        setScanNotice("Unable to initialize camera preview. Please try again.");
        setIsScanningQr(false);
        stopScanLoop();
        return;
      }

      scanVideoRef.current.srcObject = stream;
      await scanVideoRef.current.play();

      const BarcodeDetectorCtor = (
        window as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>> } }
      ).BarcodeDetector;

      const detector = BarcodeDetectorCtor ? new BarcodeDetectorCtor({ formats: ["qr_code"] }) : null;
      const useBarcodeDetector = Boolean(BarcodeDetectorCtor);
      if (!useBarcodeDetector) {
        setScanNotice("Using compatibility scan mode.");
      }
      let jsQrDecode: ((data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: "attemptBoth" | "dontInvert" | "onlyInvert" }) => { data?: string } | null) | null = null;

      const tick = async () => {
        const video = scanVideoRef.current;
        if (!video || video.readyState < 2) {
          scanRafRef.current = window.requestAnimationFrame(() => {
            void tick();
          });
          return;
        }

        try {
          let rawValue = "";
          if (useBarcodeDetector) {
            const codes = await detector!.detect(video);
            rawValue = codes[0]?.rawValue?.trim() ?? "";
          } else {
            const frameWidth = Math.max(1, Math.floor(video.videoWidth || 0));
            const frameHeight = Math.max(1, Math.floor(video.videoHeight || 0));
            if (frameWidth > 1 && frameHeight > 1) {
              if (!jsQrDecode) {
                const jsQrModule = await import("jsqr");
                jsQrDecode = jsQrModule.default;
              }
              if (!scanCanvasRef.current) {
                scanCanvasRef.current = document.createElement("canvas");
              }
              const canvas = scanCanvasRef.current;
              if (canvas.width !== frameWidth || canvas.height !== frameHeight) {
                canvas.width = frameWidth;
                canvas.height = frameHeight;
              }
              const context = canvas.getContext("2d", { willReadFrequently: true });
              if (context) {
                context.drawImage(video, 0, 0, frameWidth, frameHeight);
                const imageData = context.getImageData(0, 0, frameWidth, frameHeight);
                const code = jsQrDecode?.(imageData.data, frameWidth, frameHeight, {
                  inversionAttempts: "attemptBoth",
                });
                rawValue = code?.data?.trim() ?? "";
              }
            }
          }
          if (rawValue && routeFromQrPayload(rawValue)) {
            setIsScanningQr(false);
            stopScanLoop();
            return;
          }
        } catch {
          // Ignore transient decode misses and continue scanning.
        }

        scanRafRef.current = window.requestAnimationFrame(() => {
          void tick();
        });
      };

      scanRafRef.current = window.requestAnimationFrame(() => {
        void tick();
      });
    } catch {
      setScanNotice("Camera unavailable. You can still join by selecting a venue below.");
      setIsScanningQr(false);
      stopScanLoop();
    }
  }, [routeFromQrPayload, stopScanLoop]);

  useEffect(() => {
    return () => {
      stopScanLoop();
    };
  }, [stopScanLoop]);

  useEffect(() => {
    if (!venue) {
      return;
    }
    router.prefetch(`/venue/${venue.id}`);
  }, [router, venue]);

  const preloadVenueHome = useCallback(
    async (selectedVenue: Venue, userId: string) => {
      const venueId = selectedVenue.id;
      const safeUserId = userId.trim();
      if (!venueId || !safeUserId) {
        return;
      }

      const fetchJson = async <T,>(url: string): Promise<T | null> => {
        try {
          const response = await fetch(url, { cache: "no-store" });
          return (await response.json().catch(() => null)) as T | null;
        } catch {
          return null;
        }
      };

      const [
        venuePayload,
        leaderboardPayload,
        triviaPayload,
        triviaQuotaPayload,
        predictionsPayload,
        prizesPayload,
        bingoPayload,
        pickEmPayload,
        challengesPayload,
        pickEmSportsPayload,
      ] = await Promise.all([
        fetchJson<VenuesPayload>("/api/venues"),
        fetchJson<LeaderboardPayload>(`/api/leaderboard?venue=${encodeURIComponent(venueId)}`),
        fetchJson<TriviaPayload>(`/api/trivia?userId=${encodeURIComponent(safeUserId)}`),
        fetchJson<TriviaQuotaPayload>(`/api/trivia/quota?userId=${encodeURIComponent(safeUserId)}`),
        fetchJson<PredictionsPayload>("/api/predictions?page=1&pageSize=24&excludeSensitive=false"),
        fetchJson<PrizesPayload>(`/api/prizes?venueId=${encodeURIComponent(venueId)}&userId=${encodeURIComponent(safeUserId)}`),
        fetchJson<BingoBadgePayload>(`/api/bingo/cards?userId=${encodeURIComponent(safeUserId)}&includeSettled=true`),
        fetchJson<PickEmBadgePayload>(`/api/pickem/picks?userId=${encodeURIComponent(safeUserId)}&includeSettled=true&limit=200`),
        fetchJson<ChallengesBadgePayload>(`/api/challenges?userId=${encodeURIComponent(safeUserId)}&includeResolved=true`),
        fetchJson<{ ok?: boolean }>("/api/pickem/sports"),
      ]);
      void pickEmSportsPayload;

      const venues = venuePayload?.ok && Array.isArray(venuePayload.venues) ? venuePayload.venues : [];
      if (venues.length > 0 && !venues.some((item) => item.id === venueId)) {
        throw new Error("Selected venue is not active right now. Please choose another venue.");
      }

      const triviaQuota = triviaQuotaPayload?.ok ? (triviaQuotaPayload.quota ?? null) : null;
      const triviaQuestions =
        triviaPayload?.ok && Array.isArray(triviaPayload.questions) ? triviaPayload.questions : [];
      if (triviaQuestions.length > 0) {
        writeWarmTriviaCache({
          userId: safeUserId,
          venueId,
          questions: triviaQuestions,
          quota: triviaQuota,
        });
      }

      if (predictionsPayload?.ok) {
        writeWarmPredictionsCache({
          venueId,
          payload: {
            items: Array.isArray(predictionsPayload.items) ? predictionsPayload.items : [],
            page: predictionsPayload.page,
            pageSize: predictionsPayload.pageSize,
            totalItems: predictionsPayload.totalItems,
            totalPages: predictionsPayload.totalPages,
            sports: predictionsPayload.sports,
            leaguesBySport: predictionsPayload.leaguesBySport,
          },
        });
      }

      const activeBingoCount = (bingoPayload?.cards ?? []).filter((card) => card.status === "active").length;
      const pendingPickEmCount = (pickEmPayload?.picks ?? []).filter((pick) => pick.status === "pending").length;
      const pendingFantasyCount = (challengesPayload?.challenges ?? []).filter(
        (challenge) => challenge.status === "pending" && challenge.receiverUserId === safeUserId
      ).length;
      const homeBadgeCounts: HomeBadgeCounts = {
        bingo: activeBingoCount,
        pickem: pendingPickEmCount,
        fantasy: pendingFantasyCount,
      };

      const weeklyPrize = prizesPayload?.ok ? prizesPayload.weeklyPrize ?? null : null;
      const leaderboardEntries =
        leaderboardPayload?.ok && Array.isArray(leaderboardPayload.entries) ? leaderboardPayload.entries : [];

      writeVenueHomeBootstrap({
        fetchedAt: Date.now(),
        venueId,
        userId: safeUserId,
        triviaQuota,
        homeBadgeCounts,
        weeklyPrizeTitle: String(weeklyPrize?.prizeTitle ?? "Weekly Venue Champion Prize"),
        weeklyPrizeDescription: String(
          weeklyPrize?.prizeDescription ?? "Top the leaderboard by week end to earn this venue's reward."
        ),
        weeklyPrizePoints: Math.max(0, Number(weeklyPrize?.rewardPoints ?? 0)),
        leaderboardEntries,
      });
    },
    []
  );

  const createProfile = async () => {
    if (!venue) return;
    setErrorMessage("");
    if (!validateUsername(username)) {
      setErrorMessage("Username is required.");
      return;
    }
    if (!validatePin(pin)) {
      setErrorMessage("PIN must be exactly 4 digits.");
      return;
    }
    if (!DISABLE_GEOFENCE_FOR_TESTING && !locationVerified) {
      setErrorMessage("Verify your location before creating a profile.");
      return;
    }

    setLocationNotice("");

    const targetVenuePath = `/venue/${venue.id}`;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("tp:global-transition-show", {
          detail: { targetPath: targetVenuePath },
        })
      );
    }

    setIsTransitioning(true);
    setIsOptimisticallyEntering(true);
    setStatus("saving");
    setLocationNotice("Joining venue...");

    try {
      // Ensure fallback demo venues exist server-side before user profile insert.
      void fetch("/api/join/ensure-venue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: venue.id }),
      });

      const user = await createUserProfile({
        username,
        venueId: venue.id,
        pin,
      });

      saveVenueId(venue.id);
      saveUsername(user.username);
      saveUserId(user.id);
      await preloadVenueHome(venue, user.id);
      setVenueHomeEntryHandoff({ venueId: venue.id, userId: user.id });
      router.push(`/venue/${venue.id}`);
    } catch (error) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("tp:global-transition-hide", {
            detail: { force: true },
          })
        );
      }
      setIsOptimisticallyEntering(false);
      setIsTransitioning(false);
      setStatus("ready");
      setErrorMessage(getErrorMessage(error, "Failed to create profile."));
    }
  };

  return (
    <>
      {showIntro ? (
        <div
          className={`fixed inset-0 z-[2000] flex items-center justify-center bg-black transition-opacity duration-500 ${
            introFadeOut ? "opacity-0" : "opacity-100"
          }`}
          aria-hidden="true"
        >
          <div className="pointer-events-none relative flex w-full max-w-sm flex-col items-center justify-center px-8">
            <div className="absolute inset-x-12 top-1/2 h-24 -translate-y-1/2 rounded-full bg-cyan-300/25 blur-3xl animate-pulse" />
            <div className="absolute inset-x-8 top-1/2 h-[2px] -translate-y-1/2 bg-gradient-to-r from-transparent via-cyan-200 to-transparent opacity-70" />
            <div className="relative mb-4 h-40 w-40 rounded-full border border-white/35 p-3 shadow-[0_0_45px_rgba(56,189,248,0.22)]">
              <div className="absolute inset-0 rounded-full border border-white/20 animate-ping" />
              <div className="relative h-full w-full rounded-full bg-white/95 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/hightop-logo.svg"
                  alt=""
                  className="h-full w-full object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.28)]"
                  loading="eager"
                  decoding="async"
                />
              </div>
            </div>
            <p className="text-[0.7rem] font-semibold tracking-[0.26em] text-white/70">OFFICIAL EXPERIENCE</p>
            <p className="mt-2 text-center text-[1.06rem] font-black tracking-[0.05em] text-white [font-family:'Kalam','Bree_Serif','Nunito',cursive]">
              Hightop Sports: Game On
            </p>
            <p className="mt-1 text-[0.68rem] tracking-[0.18em] text-white/45">LOADING</p>
          </div>
        </div>
      ) : null}

      <PageShell
        title={APP_PAGE_NAMES.join}
        showBranding
        showAlerts={false}
      >
        <div className="h-full space-y-4 overflow-y-auto pr-1 text-sm">
          {errorMessage && (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-rose-700">
              {errorMessage}
            </div>
          )}

          <div className="relative overflow-x-hidden">
            <AnimatePresence initial={false} custom={panelDirection} mode="wait">
              {activePanel === "venue-login" && venue ? (
                <motion.div
                  key={`venue-login-${venue.id}`}
                  custom={panelDirection}
                  variants={ONBOARDING_PANEL_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="relative z-0 space-y-4"
                >
                  <button
                    type="button"
                    onClick={handleBackToVenueList}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[#1c2b3a] bg-gradient-to-r from-[#a93d3a] via-[#c8573e] to-[#e9784e] px-4 py-2.5 text-sm font-semibold text-[#fff7ea] shadow-sm shadow-[#1c2b3a]/35 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9784e]/60 active:scale-95 active:brightness-90"
                  >
                    <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#fff7ea]/20 text-xs">
                      ←
                    </span>
                    Choose different venue
                  </button>

                  <p className="text-sm font-medium text-slate-900">{getVenueDisplayName(venue)}</p>

                  <div className="space-y-2">
                    <label htmlFor="username" className="block font-medium">
                      Enter username and PIN
                    </label>
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <p>
                        If this is your first time playing Hightop Challenge, enter a username and PIN to create a
                        new profile.
                      </p>
                      <p className="mt-2">
                        If you have played Hightop Challenge before, enter the same username and PIN you enterred last
                        time to continue playing.
                      </p>
                    </div>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Your username"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-600"
                    />
                    <input
                      id="pin"
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={pin}
                      maxLength={4}
                      autoComplete="one-time-code"
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="4-digit PIN"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-600"
                    />
                    <button
                      type="button"
                      onClick={createProfile}
                      disabled={!canCreate || status === "saving" || isTransitioning}
                      className={`${JOIN_BUTTON_POP_CLASS} inline-flex min-h-[42px] items-center rounded-full bg-gradient-to-r from-blue-700 to-cyan-600 px-4 py-2 font-medium text-white disabled:opacity-60`}
                    >
                      {status === "saving" || isTransitioning ? "Entering venue..." : "Enter Game"}
                    </button>
                    {isOptimisticallyEntering ? (
                      <p className="text-sm text-slate-600">Taking you to your venue now...</p>
                    ) : null}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="venue-list"
                  custom={panelDirection}
                  variants={ONBOARDING_PANEL_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="relative z-0"
                >
                  {venueList.length > 0 ? (
                    <div className="space-y-3">
                      <h2 className="text-xl font-medium text-slate-900">Available Venues:</h2>
                      {locationLoading ? (
                        <p className="text-sm text-slate-600">Finding nearby venues in the background...</p>
                      ) : locationNotice ? (
                        <p className="text-sm text-slate-600">{locationNotice}</p>
                      ) : null}
                      <ul className="space-y-2">
                        {venueList.map((item, index) => {
                          const visual = getVenueVisual(item, index);
                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectVenue(item);
                                }}
                                className={`flex w-full items-center justify-between rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-100 px-4 py-3 text-base text-slate-700 shadow-sm transition-all ${JOIN_BUTTON_POP_CLASS} hover:from-blue-50 hover:to-cyan-50`}
                              >
                                <span className="flex items-center gap-3">
                                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-base font-medium text-slate-800">
                                    {visual.logoText}
                                  </span>
                                  <span className="font-medium">
                                    {pendingVenueSelectionId === item.id
                                      ? `Opening ${getVenueDisplayName(item)}...`
                                      : `Join ${getVenueDisplayName(item)}`}
                                  </span>
                                </span>
                                <span
                                  aria-hidden="true"
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-xl"
                                >
                                  {visual.icon}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <InlineSlotAdClient
                        slot="leaderboard-sidebar"
                        venueId={venueParam || undefined}
                        pageKey="join"
                        adType="inline"
                        displayTrigger="on-load"
                        allowAnyVenue
                        showPlaceholder
                      />
                    </div>
                  ) : status === "loading" ? (
                    <div className="space-y-3 rounded-2xl border-4 border-slate-900 bg-white p-4 text-sm text-slate-800 shadow-[5px_5px_0_#0f172a]">
                      <p className="font-semibold">Loading venues...</p>
                      <p>Getting venues ready for you now.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-2xl border-4 border-slate-900 bg-white p-4 text-sm text-slate-800 shadow-[5px_5px_0_#0f172a]">
                      <p className="font-semibold">Nearby venues only</p>
                      {locationLoading ? (
                        <p>Checking your location to find venues in range...</p>
                      ) : locationNotice ? (
                        <p>{locationNotice}</p>
                      ) : (
                        <p>No venue is currently in range from your location.</p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          router.refresh();
                        }}
                        className={`${JOIN_BUTTON_POP_CLASS} inline-flex min-h-[42px] items-center rounded-full bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-2 font-medium text-white`}
                      >
                        Retry nearby venue scan
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={openAdminDashboard}
              className={`${JOIN_BUTTON_POP_CLASS} inline-flex min-h-[44px] w-full items-center justify-center rounded-2xl border-4 border-slate-900 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-[4px_4px_0_#0f172a]`}
            >
              Admin Login
            </button>
          </div>
        </div>
      </PageShell>
    </>
  );
}
