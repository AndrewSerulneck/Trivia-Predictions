"use client";

import { useEffect, useMemo, useState } from "react";
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

export function JoinFlow({ initialVenueId }: { initialVenueId: string }) {
  const router = useRouter();
  const venueParam = initialVenueId.trim();

  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [venue, setVenue] = useState<Venue | null>(null);
  const [venueList, setVenueList] = useState<Venue[]>([]);
  const [existingUser, setExistingUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [locationVerified, setLocationVerified] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setStatus("loading");
      setErrorMessage("");
      setExistingUser(null);
      setLocationVerified(false);
      setDistanceMeters(null);

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
        setErrorMessage(error instanceof Error ? error.message : "Failed to initialize join flow.");
      }
    };

    void load();
  }, [venueParam]);

  const canCreate = useMemo(() => {
    return Boolean(
      isSupabaseConfigured && venue && validateUsername(username) && locationVerified && !existingUser
    );
  }, [venue, username, locationVerified, existingUser]);

  const verifyLocation = async () => {
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
      } else {
        setLocationVerified(false);
        setErrorMessage(
          `You are ${Math.round(distance)}m away. You must be within ${venue.radius}m of ${venue.name} to join.`
        );
      }
    } catch (error) {
      setLocationVerified(false);
      setErrorMessage(error instanceof Error ? error.message : "Unable to verify location.");
    } finally {
      setLocationLoading(false);
    }
  };

  const continueToGame = () => {
    if (!venue || !existingUser) return;
    saveVenueId(venue.id);
    saveUsername(existingUser.username);
    saveUserId(existingUser.id);
    router.push("/trivia");
  };

  const createProfile = async () => {
    if (!venue) return;
    if (!validateUsername(username)) {
      setErrorMessage("Username must be 3-20 characters and only use letters, numbers, or underscore.");
      return;
    }
    if (!locationVerified) {
      setErrorMessage("Verify your location before creating a profile.");
      return;
    }

    setStatus("saving");
    setErrorMessage("");

    try {
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
      router.push("/trivia");
    } catch (error) {
      setStatus("ready");
      setErrorMessage(error instanceof Error ? error.message : "Failed to create profile.");
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
            No venue selected. Use a QR link like <code>/join?v=venue-downtown</code> or pick one below.
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
              {venueList.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/join?v=${item.id}`}
                    className="inline-flex rounded-md bg-slate-100 px-3 py-2 text-slate-700 hover:bg-slate-200"
                  >
                    {item.name} ({item.id})
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {venue && (
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="font-medium">{venue.name}</p>
              <p className="text-slate-600">
                Geofence: within {venue.radius}m. (Adjustable later in the venues table.)
              </p>
              {distanceMeters !== null && (
                <p className="text-slate-600">Your distance: {Math.round(distanceMeters)}m</p>
              )}
            </div>

            <button
              type="button"
              onClick={verifyLocation}
              disabled={locationLoading || status === "loading"}
              className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {locationLoading ? "Checking location..." : "Verify I am at this venue"}
            </button>

            {existingUser ? (
              <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-3">
                <p>
                  Welcome back <strong>{existingUser.username}</strong>. You already have a profile at this venue.
                </p>
                <button
                  type="button"
                  onClick={continueToGame}
                  disabled={!locationVerified}
                  className="rounded-md bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-60"
                >
                  Continue to Trivia
                </button>
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
