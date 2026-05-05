import { supabase } from "@/lib/supabase";
import type { User } from "@/types";

type UserProfileRow = {
  id: string;
  auth_id: string | null;
  username: string;
  venue_id: string;
  points: number;
  created_at: string;
};

const JOIN_PROFILE_REQUEST_TIMEOUT_MS = 25000;

function mapUserProfileRow(row: UserProfileRow): User {
  return {
    id: row.id,
    authId: row.auth_id ?? undefined,
    username: row.username,
    venueId: row.venue_id,
    points: row.points,
    createdAt: row.created_at,
  };
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError"
  );
}

export function validateUsername(username: string): boolean {
  return username.trim().length > 0;
}

export function validatePin(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim());
}

export async function signInAnonymously(): Promise<void> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw error;
  }
}

export async function ensureAnonymousSession(): Promise<string> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  // Clear-first pattern to avoid stale/ghost session conflicts on shared devices.
  await supabase.auth.signOut();
  console.log("[Auth] Session Cleared");

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw error;
  }
  console.log("[Auth] Anonymous Session Created");

  const authUserId = data.user?.id;
  if (!authUserId) {
    throw new Error("Anonymous sign-in succeeded but no auth user was returned.");
  }

  return authUserId;
}

export async function createUserProfile(params: {
  username: string;
  venueId: string;
  pin: string;
  signal?: AbortSignal;
  selectedVenueId?: string;
}): Promise<User> {
  if (!supabase || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("[Auth] Environment Config Error: Supabase URL missing.");
    throw new Error("Supabase is not configured.");
  }

  const username = params.username.trim();
  const pin = params.pin.trim();
  if (!validateUsername(username)) {
    throw new Error("Username is required.");
  }
  if (!validatePin(pin)) {
    throw new Error("PIN must be exactly 4 digits.");
  }

  const selectedVenueId = String(params.selectedVenueId ?? params.venueId).trim();
  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    timeoutController.abort();
  }, JOIN_PROFILE_REQUEST_TIMEOUT_MS);
  const externalSignal = params.signal;
  const forwardAbort = () => {
    timeoutController.abort();
  };
  externalSignal?.addEventListener("abort", forwardAbort, { once: true });
  let response: Response;
  try {
    response = await fetch("/api/join/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Selected-Venue-Id": selectedVenueId,
      },
      body: JSON.stringify({
        username,
        venueId: params.venueId,
        pin,
        selectedVenueId,
      }),
      signal: timeoutController.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      if (externalSignal?.aborted) {
        throw new Error("Login request was canceled.");
      }
      throw new Error("Join request timed out. Please try again.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", forwardAbort);
  }

  const rawBody = await response.text().catch(() => "");
  let payload = {} as {
    ok?: boolean;
    error?: string;
    user?: User;
  };
  try {
    payload = rawBody ? (JSON.parse(rawBody) as typeof payload) : {};
  } catch {
    payload = {};
  }
  if (!response.ok || !payload.ok || !payload.user) {
    console.error("[Auth] Profile Create Failed", {
      status: response.status,
      body: rawBody,
      error: payload.error ?? null,
    });
    throw new Error(payload.error ?? "Failed to enter game.");
  }
  return payload.user;
}

export async function signOut(): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
