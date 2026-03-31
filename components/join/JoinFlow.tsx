"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { PageShell } from "@/components/ui/PageShell";
import { BackButton } from "@/components/navigation/BackButton";
import {
  createUserProfile,
  ensureAnonymousSession,
  validatePin,
  validateUsername,
} from "@/lib/auth";
import { calculateDistanceMeters, getCurrentLocation } from "@/lib/geolocation";
import { saveUserId, saveUsername, saveVenueId } from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getVenueById, listVenues } from "@/lib/venues";
import type { Venue } from "@/types";
import { getVenueDisplayName, getVenueVisual as getVenueVisualFromConfig } from "@/lib/venueDisplay";

type Status = "idle" | "loading" | "ready" | "saving" | "error";

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

const getVenueVisual = (venue: Venue, index: number) => getVenueVisualFromConfig(venue, index);

export function JoinFlow({ initialVenueId }: { initialVenueId: string }) {
  const router = useRouter();
  const venueParam = initialVenueId.trim();

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
  const [isScanningQr, setIsScanningQr] = useState(false);
  const [scanNotice, setScanNotice] = useState("");
  const autoVerificationAttemptedRef = useRef(false);
  const scanVideoRef = useRef<HTMLVideoElement | null>(null);
  const scanStreamRef = useRef<MediaStream | null>(null);
  const scanRafRef = useRef<number | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const load = async () => {
      setStatus("loading");
      setErrorMessage("");
      setLocationVerified(false);
      setDistanceMeters(null);
      setLocationNotice("Verifying your location...");
      autoVerificationAttemptedRef.current = false;

      try {
        const venues = await listVenues();

        if (!venueParam) {
          setLocationLoading(true);
          try {
            const current = await getCurrentLocation();
            const nearbyVenues = venues.filter((item) => {
              const distance = calculateDistanceMeters(current, {
                latitude: item.latitude,
                longitude: item.longitude,
              });
              return distance <= item.radius;
            });
            setVenueList(nearbyVenues);
            if (nearbyVenues.length > 0) {
              setLocationNotice(`Showing ${nearbyVenues.length} nearby venue(s) within range.`);
            } else {
              setLocationNotice("No nearby venues are within geofence range right now.");
            }
          } catch (error) {
            setVenueList([]);
            setLocationNotice("");
            setErrorMessage(
              getErrorMessage(
                error,
                "Location access is required to show nearby venues. Enable location services and retry."
              )
            );
          } finally {
            setLocationLoading(false);
          }
          setVenue(null);
          setStatus("ready");
          return;
        }

        const venueData = await getVenueById(venueParam);
        if (!venueData) {
          setStatus("error");
          setErrorMessage(`Venue "${venueParam}" was not found.`);
          return;
        }

        setVenue(venueData);

        if (!isSupabaseConfigured) {
          setStatus("ready");
          setErrorMessage(
            "Supabase is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
          );
          return;
        }

        await ensureAnonymousSession();
        setStatus("ready");
      } catch (error) {
        setStatus("error");
        setErrorMessage(getErrorMessage(error, "Failed to initialize join flow."));
      }
    };

    void load();
  }, [venueParam]);

  const canCreate = useMemo(() => {
    return Boolean(
      isSupabaseConfigured &&
        venue &&
        validateUsername(username) &&
        validatePin(pin) &&
        locationVerified
    );
  }, [venue, username, pin, locationVerified]);

  const verifyLocation = useCallback(async () => {
    if (!venue) return;

    setLocationLoading(true);
    setErrorMessage("");

    try {
      const current = await getCurrentLocation();
      const distance = calculateDistanceMeters(current, {
        latitude: venue.latitude,
        longitude: venue.longitude,
      });
      setDistanceMeters(distance);

      if (distance <= venue.radius) {
        setLocationVerified(true);
        setLocationNotice("Location verified successfully.");
      } else {
        setLocationVerified(false);
        setLocationNotice("");
        setErrorMessage(
          `You are ${Math.round(distance)}m away. You must be within ${venue.radius}m of ${getVenueDisplayName(
            venue
          )} to join.`
        );
      }
    } catch (error) {
      setLocationVerified(false);
      setLocationNotice("");
      setErrorMessage(getErrorMessage(error, "Unable to verify location."));
    } finally {
      setLocationLoading(false);
    }
  }, [venue]);

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
                const code = jsQR(imageData.data, frameWidth, frameHeight, {
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
    if (!venue || status !== "ready" || !isSupabaseConfigured) {
      return;
    }
    if (autoVerificationAttemptedRef.current) {
      return;
    }
    autoVerificationAttemptedRef.current = true;
    void verifyLocation();
  }, [venue, status, verifyLocation]);

  const createProfile = async () => {
    if (!venue) return;
    if (!validateUsername(username)) {
      setErrorMessage("Username is required.");
      return;
    }
    if (!validatePin(pin)) {
      setErrorMessage("PIN must be exactly 4 digits.");
      return;
    }
    if (!locationVerified) {
      setErrorMessage("Verify your location before creating a profile.");
      return;
    }

    setLocationLoading(true);
    try {
      const current = await getCurrentLocation();
      const distance = calculateDistanceMeters(current, {
        latitude: venue.latitude,
        longitude: venue.longitude,
      });
      setDistanceMeters(distance);
      if (distance > venue.radius) {
        setLocationVerified(false);
        setLocationNotice("");
        setErrorMessage(
          `You are ${Math.round(distance)}m away. You must be within ${venue.radius}m of ${getVenueDisplayName(
            venue
          )} to join.`
        );
        return;
      }
      setLocationVerified(true);
      setLocationNotice("Location verified successfully.");
    } catch (error) {
      setLocationVerified(false);
      setLocationNotice("");
      setErrorMessage(getErrorMessage(error, "Unable to verify location."));
      return;
    } finally {
      setLocationLoading(false);
    }

    setStatus("saving");
    setErrorMessage("");

    try {
      // Ensure fallback demo venues exist server-side before user profile insert.
      await fetch("/api/join/ensure-venue", {
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
      router.push(`/venue/${venue.id}`);
    } catch (error) {
      setStatus("ready");
      setErrorMessage(getErrorMessage(error, "Failed to create profile."));
    }
  };

  return (
    <PageShell
      title="Join Venue"
      description="Select a venue or scan QR code."
    >
      <div className="space-y-4 text-sm">
        {errorMessage && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-rose-700">
            {errorMessage}
          </div>
        )}

        {!venue && venueList.length > 0 && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                void startQrScan();
              }}
              className={`${JOIN_BUTTON_POP_CLASS} inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border-4 border-slate-900 bg-cyan-300 px-5 py-2.5 text-lg font-medium text-slate-900 shadow-[5px_5px_0_#0f172a]`}
            >
              <span aria-hidden="true" className="text-2xl leading-none">
                📷
              </span>
              Scan Venue QR Code
            </button>
            {isScanningQr ? (
              <div className="space-y-2">
                <div className="rounded-2xl border-4 border-slate-900 bg-white p-2 shadow-[4px_4px_0_#0f172a]">
                  <video ref={scanVideoRef} autoPlay playsInline muted className="h-44 w-full rounded-xl bg-black object-cover" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsScanningQr(false);
                    setScanNotice("");
                    stopScanLoop();
                  }}
                  className={`${JOIN_BUTTON_POP_CLASS} rounded-2xl border-4 border-slate-900 bg-white px-4 py-2 text-base font-medium text-slate-900 shadow-[4px_4px_0_#0f172a]`}
                >
                  Stop Scanning
                </button>
                {scanNotice ? <p className="px-1 text-sm font-medium text-slate-700">{scanNotice}</p> : null}
              </div>
            ) : null}
            <h2 className="text-xl font-medium text-slate-900">Available Venues:</h2>
            <ul className="space-y-2">
              {venueList.map((item, index) => {
                const visual = getVenueVisual(item, index);
                return (
                <li key={item.id}>
                  <Link
                    href={`/?v=${item.id}`}
                    role="button"
                    className={`flex w-full items-center justify-between rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-100 px-4 py-3 text-base text-slate-700 shadow-sm transition-all ${JOIN_BUTTON_POP_CLASS} hover:from-blue-50 hover:to-cyan-50`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-base font-medium text-slate-800">
                        {visual.logoText}
                      </span>
                      <span className="font-medium">Join {getVenueDisplayName(item)}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-xl"
                    >
                      {visual.icon}
                    </span>
                  </Link>
                </li>
                );
              })}
            </ul>
            <div className="rounded-none border border-dashed border-slate-400 bg-slate-50 p-4 text-center text-slate-600">
              <p className="text-xs uppercase tracking-wide text-slate-500">Advertisement</p>
              <p className="mt-1 font-medium">[ Placeholder Banner Ad - 728 x 90 ]</p>
            </div>
          </div>
        )}

        {!venue && venueList.length === 0 && status === "ready" && (
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

        {venue && (
          <div className="space-y-4">
            <BackButton label="Choose different venue" href="/" />
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="font-medium">{getVenueDisplayName(venue)}</p>
              {distanceMeters !== null && (
                <p className="text-slate-600">Your distance: {Math.round(distanceMeters)}m</p>
              )}
              {locationLoading && (
                <p className="text-slate-600">Checking your location...</p>
              )}
              {locationNotice && (
                <p className="text-emerald-700">{locationNotice}</p>
              )}
            </div>

            {!locationVerified && !locationLoading && (
              <button
                type="button"
                onClick={verifyLocation}
                disabled={status === "loading"}
                className={`${JOIN_BUTTON_POP_CLASS} inline-flex min-h-[42px] items-center rounded-full bg-gradient-to-r from-slate-900 to-slate-800 px-4 py-2 font-medium text-white disabled:opacity-60`}
              >
                Retry location check
              </button>
            )}

            <div className="space-y-2">
              <label htmlFor="username" className="block font-medium">
                Enter username and PIN
              </label>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p>
                  If this is your first time playing Hightop Challenge, simply enter a username and PIN to create a
                  new profile.
                </p>
                <p className="mt-2">
                  If have played Hightop Challenge before, simply enter the same username and PIN you enterred last
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
                disabled={!canCreate || status === "saving"}
                className={`${JOIN_BUTTON_POP_CLASS} inline-flex min-h-[42px] items-center rounded-full bg-gradient-to-r from-blue-700 to-cyan-600 px-4 py-2 font-medium text-white disabled:opacity-60`}
              >
                {status === "saving" ? "Entering..." : "Enter Game"}
              </button>
            </div>
          </div>
        )}

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
  );
}
