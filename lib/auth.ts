import { supabase } from "@/lib/supabase";
import type { User } from "@/types";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

type UserProfileRow = {
  id: string;
  auth_id: string | null;
  username: string;
  venue_id: string;
  points: number;
  created_at: string;
};

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

export function validateUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username.trim());
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

export async function getUserForVenue(venueId: string): Promise<User | null> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const authUserId = await ensureAnonymousSession();
  const { data, error } = await supabase
    .from("users")
    .select("id, auth_id, username, venue_id, points, created_at")
    .eq("auth_id", authUserId)
    .eq("venue_id", venueId)
    .maybeSingle<UserProfileRow>();

  if (error) {
    throw error;
  }

  return data ? mapUserProfileRow(data) : null;
}

export async function checkUsernameAtVenue(username: string, venueId: string): Promise<boolean> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const normalized = username.trim();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("venue_id", venueId)
    .ilike("username", normalized)
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.length ?? 0) === 0;
}

export async function createUserProfile(params: {
  username: string;
  venueId: string;
}): Promise<User> {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const username = params.username.trim();
  if (!validateUsername(username)) {
    throw new Error("Username must be 3-20 characters and use letters, numbers, or underscore.");
  }

  const authUserId = await ensureAnonymousSession();

  const { data, error } = await supabase
    .from("users")
    .insert({
      auth_id: authUserId,
      username,
      venue_id: params.venueId,
      points: 0,
    })
    .select("id, auth_id, username, venue_id, points, created_at")
    .single<UserProfileRow>();

  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error("That username is already taken at this venue.");
    }
    throw error;
  }

  return mapUserProfileRow(data);
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
