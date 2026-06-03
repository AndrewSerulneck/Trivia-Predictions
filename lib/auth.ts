import { supabase } from "@/lib/supabase";
import { logAuthIncident } from "@/lib/authIncidentDebug";
import { isValidPin, normalizePin } from "@/lib/pin";
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
const AUTH_USER_LOOKUP_TIMEOUT_MS = 1200;

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
  return isValidPin(pin);
}

async function getCurrentAuthUserId(traceId?: string): Promise<string | null> {
  if (!supabase) {
    logAuthIncident("auth-helper", "auth-user-lookup-skipped", {
      traceId: traceId ?? null,
      reason: "supabase-unconfigured",
    });
    return null;
  }

  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  const startedAt = Date.now();
  logAuthIncident("auth-helper", "auth-user-lookup-start", { traceId: traceId ?? null });
  try {
    const result = await Promise.race([
      supabase.auth.getUser().catch(() => ({ data: { user: null } })),
      new Promise<{ data: { user: null } }>((resolve) => {
        timeoutId = globalThis.setTimeout(() => {
          resolve({ data: { user: null } });
        }, AUTH_USER_LOOKUP_TIMEOUT_MS);
      }),
    ]);

    const authUserId = result.data.user?.id ?? null;
    logAuthIncident("auth-helper", "auth-user-lookup-finish", {
      traceId: traceId ?? null,
      authUserFound: Boolean(authUserId),
      elapsedMs: Date.now() - startedAt,
    });
    return authUserId;
  } catch {
    logAuthIncident("auth-helper", "auth-user-lookup-error", {
      traceId: traceId ?? null,
      elapsedMs: Date.now() - startedAt,
    });
    return null;
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
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
  traceId?: string;
}): Promise<User> {
  if (!supabase || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("[Auth] Environment Config Error: Supabase URL missing.");
    throw new Error("Supabase is not configured.");
  }

  const username = params.username.trim();
  const pin = normalizePin(params.pin);
  if (!validateUsername(username)) {
    throw new Error("Username is required.");
  }
  if (!validatePin(pin)) {
    throw new Error("PIN must be exactly 4 digits.");
  }

  const selectedVenueId = String(params.selectedVenueId ?? params.venueId).trim();
  const traceId = String(params.traceId ?? "").trim() || null;
  logAuthIncident("auth-helper", "create-user-profile-start", {
    traceId,
    venueId: params.venueId,
    selectedVenueId,
    username,
  });
  const authUserId = await getCurrentAuthUserId(traceId ?? undefined);
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
  const requestStartedAt = Date.now();
  logAuthIncident("auth-helper", "join-profile-fetch-start", {
    traceId,
    venueId: params.venueId,
  });
  try {
    response = await fetch("/api/join/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Selected-Venue-Id": selectedVenueId,
        ...(traceId ? { "X-Auth-Trace-Id": traceId } : {}),
      },
      body: JSON.stringify({
        username,
        venueId: params.venueId,
        pin,
        selectedVenueId,
        authUserId,
      }),
      signal: timeoutController.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      logAuthIncident("auth-helper", "join-profile-fetch-abort", {
        traceId,
        venueId: params.venueId,
        elapsedMs: Date.now() - requestStartedAt,
        externalAborted: Boolean(externalSignal?.aborted),
      });
      if (externalSignal?.aborted) {
        throw new Error("Login request was canceled.");
      }
      throw new Error("Join request timed out. Please try again.");
    }
    logAuthIncident("auth-helper", "join-profile-fetch-error", {
      traceId,
      venueId: params.venueId,
      elapsedMs: Date.now() - requestStartedAt,
    });
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
  logAuthIncident("auth-helper", "join-profile-fetch-finish", {
    traceId,
    venueId: params.venueId,
    status: response.status,
    ok: Boolean(response.ok && payload.ok && payload.user),
    elapsedMs: Date.now() - requestStartedAt,
  });
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

export async function createOrLoginAccount(params: {
  username: string;
  pin: string;
  mode?: "login" | "create";
  traceId?: string;
  signal?: AbortSignal;
}): Promise<{ id: string; username: string; authId?: string; godMode?: boolean }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Supabase is not configured.");
  }

  const username = params.username.trim();
  const pin = normalizePin(params.pin);
  if (!validateUsername(username)) {
    throw new Error("Username is required.");
  }
  if (!validatePin(pin)) {
    throw new Error("PIN must be exactly 4 digits.");
  }

  const traceId = String(params.traceId ?? "").trim() || null;
  const authUserId = await getCurrentAuthUserId(traceId ?? undefined);

  logAuthIncident("auth-helper", "create-or-login-account-start", { traceId, username });

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), JOIN_PROFILE_REQUEST_TIMEOUT_MS);
  params.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetch("/api/join/account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(traceId ? { "X-Auth-Trace-Id": traceId } : {}),
      },
      body: JSON.stringify({ username, pin, authUserId, ...(params.mode ? { mode: params.mode } : {}) }),
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw params.signal?.aborted
        ? new Error("Login request was canceled.")
        : new Error("Account request timed out. Please try again.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  const rawBody = await response.text().catch(() => "");
  let payload = {} as { ok?: boolean; error?: string; account?: { id: string; username: string; authId?: string; godMode?: boolean } };
  try {
    payload = rawBody ? (JSON.parse(rawBody) as typeof payload) : {};
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.ok || !payload.account) {
    throw new Error(payload.error ?? "Failed to authenticate account.");
  }
  return payload.account;
}

export async function resolveVenueProfile(params: {
  accountId: string;
  venueId: string;
  traceId?: string;
  signal?: AbortSignal;
}): Promise<User> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Supabase is not configured.");
  }

  const traceId = String(params.traceId ?? "").trim() || null;
  logAuthIncident("auth-helper", "resolve-venue-profile-start", {
    traceId,
    accountId: params.accountId,
    venueId: params.venueId,
  });

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), JOIN_PROFILE_REQUEST_TIMEOUT_MS);
  params.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetch("/api/join/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(traceId ? { "X-Auth-Trace-Id": traceId } : {}),
      },
      body: JSON.stringify({ accountId: params.accountId, venueId: params.venueId }),
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw params.signal?.aborted
        ? new Error("Request was canceled.")
        : new Error("Venue profile request timed out. Please try again.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  const rawBody = await response.text().catch(() => "");
  let payload = {} as { ok?: boolean; error?: string; user?: User };
  try {
    payload = rawBody ? (JSON.parse(rawBody) as typeof payload) : {};
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.ok || !payload.user) {
    throw new Error(payload.error ?? "Failed to resolve venue profile.");
  }
  return payload.user;
}

export async function resolveVenueProfileFromSession(params: {
  sessionUserId: string;
  venueId: string;
  traceId?: string;
  signal?: AbortSignal;
}): Promise<User> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Supabase is not configured.");
  }

  const traceId = String(params.traceId ?? "").trim() || null;
  logAuthIncident("auth-helper", "resolve-venue-profile-from-session-start", {
    traceId,
    sessionUserId: params.sessionUserId,
    venueId: params.venueId,
  });

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), JOIN_PROFILE_REQUEST_TIMEOUT_MS);
  params.signal?.addEventListener("abort", () => controller.abort(), { once: true });

  let response: Response;
  try {
    response = await fetch("/api/join/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(traceId ? { "X-Auth-Trace-Id": traceId } : {}),
      },
      body: JSON.stringify({ sessionUserId: params.sessionUserId, venueId: params.venueId }),
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw params.signal?.aborted
        ? new Error("Request was canceled.")
        : new Error("Venue profile request timed out. Please try again.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }

  const rawBody = await response.text().catch(() => "");
  let payload = {} as { ok?: boolean; error?: string; user?: User };
  try {
    payload = rawBody ? (JSON.parse(rawBody) as typeof payload) : {};
  } catch {
    payload = {};
  }

  if (!response.ok || !payload.ok || !payload.user) {
    throw new Error(payload.error ?? "Failed to resolve venue profile.");
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
