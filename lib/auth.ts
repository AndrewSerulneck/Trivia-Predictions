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

const JOIN_PROFILE_REQUEST_TIMEOUT_MS = 12000;

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

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }

  const sessionUserId = sessionData.session?.user?.id;
  if (sessionUserId) {
    return sessionUserId;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw error;
  }

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
}): Promise<User> {
  if (!supabase) {
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

  await ensureAnonymousSession();

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, JOIN_PROFILE_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("/api/join/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        venueId: params.venueId,
        pin,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("Join request timed out. Please try again.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    user?: User;
  };
  if (!response.ok || !payload.ok || !payload.user) {
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
