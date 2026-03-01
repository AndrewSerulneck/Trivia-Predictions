"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/ui/PageShell";
import {
  checkUsernameAtVenue,
  createUserProfile,
  ensureAnonymousSession,
  getUserForVenue,
  validateUsername,
} from "@/lib/auth";
import { calculateDistanceMeters, getCurrentLocation } from "@/lib/geolocation";
import { saveUserId, saveUsername, saveVenueId } from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getVenueById, listVenues } from "@/lib/venues";
import type { User, Venue } from "@/types";

type Status = "idle" | "loading" | "ready" | "saving" | "error";

type VenueVisual = {
  logoText: string;
  icon: string;
};

const DEFAULT_ICONS = ["🏟️", "🍻", "🎯", "🎲", "🏀", "🎤", "🏈", "🍔", "🎵", "🎮"];

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  let normalized = value.trim();
  for (let i = 0; i < 2; i += 1) {
    if (
      (normalized.startsWith('""') && normalized.endsWith('""')) ||
      (normalized.startsWith("''") && normalized.endsWith("''"))
    ) {
      normalized = normalized.slice(2, -2).trim();
      continue;
    }
    if (
      (normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
      normalized = normalized.slice(1, -1).trim();
      continue;
    }
    break;
  }
  const lowered = normalized.toLowerCase();
  return lowered === "true" || lowered === "1" || lowered === "yes" || lowered === "on";
}

function getVenueVisual(venue: Venue, index: number): VenueVisual {
  const knownVisuals: Record<string, VenueVisual> = {
    "venue-downtown": { logoText: "DS", icon: "🏟️" },
    "venue-uptown": { logoText: "UT", icon: "🍻" },
    "venue-riverside": { logoText: "RG", icon: "🌊" },
  };

  const known = knownVisuals[venue.id];
  if (known) return known;

  const words = venue.name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .filter(Boolean);
  const logoText = (words[0] ?? "") + (words[1] ?? words[0] ?? "V");
  const icon = DEFAULT_ICONS[index % DEFAULT_ICONS.length] ?? "📍";

  return { logoText, icon };
}

export function JoinFlow({ initialVenueId }: { initialVenueId: string }) {
  const router = useRouter();
  const venueParam = initialVenueId.trim();
  // Always bypass geofencing in local development.
  const geofenceBypassed =
    process.env.NODE_ENV !== "production" || parseBooleanEnv(process.env.NEXT_PUBLIC_DISABLE_GEOFENCE);

  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [venue, setVenue] = useState<Venue | null>(null);
  const [venueList, setVenueList] = useState<Venue[]>([]);
  const [existingUser, setExistingUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [locationVerified, setLocationVerified] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const autoVerificationAttemptedRef = useRef(false);
  const redirectStartedRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      setStatus("loading");
      setErrorMessage("");
      setExistingUser(null);
      setLocationVerified(geofenceBypassed);
      setDistanceMeters(null);
      setLocationNotice(
        geofenceBypassed
          ? "Location verification bypassed for local testing."
          : "Verifying your location..."
      );
      autoVerificationAttemptedRef.current = false;
      redirectStartedRef.current = false;

      try {
        const venues = await listVenues();
        setVenueList(venues);

        if (!venueParam) {
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
        const user = await getUserForVenue(venueData.id);
        if (user) {
          setExistingUser(user);
          setUsername(user.username);
        }

        setStatus("ready");
      } catch (error) {
        setStatus("error");
        setErrorMessage(getErrorMessage(error, "Failed to initialize join flow."));
      }
    };

    void load();
  }, [venueParam, geofenceBypassed]);

  const canCreate = useMemo(() => {
    return Boolean(
      isSupabaseConfigured &&
        venue &&
        validateUsername(username) &&
        (locationVerified || geofenceBypassed) &&
        !existingUser
    );
  }, [venue, username, locationVerified, geofenceBypassed, existingUser]);

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
          `You are ${Math.round(distance)}m away. You must be within ${venue.radius}m of ${venue.name} to join.`
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

  const continueToGame = useCallback(() => {
    if (!venue || !existingUser) return;
    saveVenueId(venue.id);
    saveUsername(existingUser.username);
    saveUserId(existingUser.id);
    router.push(`/venue/${venue.id}`);
  }, [existingUser, router, venue]);

  useEffect(() => {
    if (!venue || status !== "ready" || !isSupabaseConfigured) {
      return;
    }
    if (geofenceBypassed) {
      setLocationVerified(true);
      return;
    }
    if (autoVerificationAttemptedRef.current) {
      return;
    }
    autoVerificationAttemptedRef.current = true;
    void verifyLocation();
  }, [venue, status, geofenceBypassed, verifyLocation]);

  useEffect(() => {
    if (!existingUser || !locationVerified || redirectStartedRef.current) {
      return;
    }

    redirectStartedRef.current = true;
    setLocationNotice("Location verified successfully. Taking you to your venue...");
    const timeoutId = window.setTimeout(() => {
      continueToGame();
    }, 900);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [existingUser, locationVerified, continueToGame]);

  const createProfile = async () => {
    if (!venue) return;
    if (!validateUsername(username)) {
      setErrorMessage("Username is required.");
      return;
    }
    if (!locationVerified && !geofenceBypassed) {
      setErrorMessage("Verify your location before creating a profile.");
      return;
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

      const available = await checkUsernameAtVenue(username, venue.id);
      if (!available) {
        setStatus("ready");
        setErrorMessage("That username is already taken at this venue.");
        return;
      }

      const created = await createUserProfile({
        username,
        venueId: venue.id,
      });

      saveVenueId(venue.id);
      saveUsername(created.username);
      saveUserId(created.id);
      router.push(`/venue/${venue.id}`);
    } catch (error) {
      setStatus("ready");
      setErrorMessage(getErrorMessage(error, "Failed to create profile."));
    }
  };

  return (
    <PageShell
      title="Join Venue"
      description="Create or continue your venue-specific profile to play trivia and predictions."
    >
      <div className="space-y-4 text-sm">
        {!venueParam && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-800">
            No venue selected. Use a QR link like <code>/?v=venue-downtown</code> or pick one below.
          </div>
        )}

        {errorMessage && (
          <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-rose-700">
            {errorMessage}
          </div>
        )}

        {!venue && venueList.length > 0 && (
          <div className="space-y-2">
            <h2 className="font-medium">Available test venues</h2>
            <ul className="space-y-2">
              {venueList.map((item, index) => {
                const visual = getVenueVisual(item, index);
                return (
                <li key={item.id}>
                  <Link
                    href={`/?v=${item.id}`}
                    className="flex w-full items-center justify-between rounded-none border border-slate-300 bg-slate-100 px-3 py-3 text-slate-700 hover:bg-slate-200"
                  >
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-none border border-slate-400 bg-white font-semibold text-slate-800">
                        {visual.logoText}
                      </span>
                      <span className="font-medium">Join {item.name}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-none border border-slate-400 bg-white text-lg"
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

        {venue && (
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="font-medium">{venue.name}</p>
              <p className="text-slate-600">
                Geofence: within {venue.radius}m. (Adjustable later in the venues table.)
              </p>
              {geofenceBypassed && (
                <p className="text-amber-700">
                  Geofence bypass is enabled for local testing (`NEXT_PUBLIC_DISABLE_GEOFENCE=true`).
                </p>
              )}
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

            {!locationVerified && !geofenceBypassed && !locationLoading && (
              <button
                type="button"
                onClick={verifyLocation}
                disabled={status === "loading"}
                className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
              >
                Retry location check
              </button>
            )}

            {existingUser ? (
              <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-3">
                <p>
                  Welcome back <strong>{existingUser.username}</strong>. You already have a profile at this venue.
                </p>
                <p className="text-emerald-800">
                  {locationVerified || geofenceBypassed
                    ? "Continuing to your venue..."
                    : "Waiting for location verification before continuing."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="username" className="block font-medium">
                  Choose username (unique at this venue)
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Your username"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-600"
                />
                <button
                  type="button"
                  onClick={createProfile}
                  disabled={!canCreate || status === "saving"}
                  className="rounded-md bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-60"
                >
                  {status === "saving" ? "Creating profile..." : "Create Profile and Continue"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
