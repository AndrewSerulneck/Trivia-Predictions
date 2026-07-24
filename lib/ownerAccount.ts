import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const OWNER_ACCOUNT_GENERIC_ERROR = "Something went wrong. Please try again.";
export const OWNER_ACCOUNT_INVALID_EMAIL_ERROR = "Enter a valid email address.";
export const OWNER_ACCOUNT_DUPLICATE_EMAIL_ERROR = "That email address is unavailable.";
export const OWNER_ACCOUNT_WRONG_PASSWORD_ERROR = "Current password is incorrect.";
export const OWNER_ACCOUNT_EMAIL_PASSWORD_REQUIRED_ERROR = "Enter your current password to change your email.";
export const OWNER_ACCOUNT_PASSWORD_REQUIRED_ERROR = "Enter your current password to change your password.";
export const OWNER_ACCOUNT_SHORT_PASSWORD_ERROR = "Password must be at least 8 characters.";
export const OWNER_ACCOUNT_MIN_PASSWORD_LENGTH = 8;

export type OwnerAccountProfile = {
  id: string;
  authId: string;
  name: string;
  email: string;
};

type OwnerAccountRow = {
  id: string;
  auth_id: string | null;
  name: string | null;
  email: string | null;
};

export type OwnerPasswordReauthResult =
  | { ok: true }
  | { ok: false; reason: "invalid_credentials" | "server_error" };

export const normalizeOwnerEmail = (email: string): string => email.trim().toLowerCase();

export const isValidOwnerEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function loadOwnerAccountProfile(ownerId: string): Promise<OwnerAccountProfile | null> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data, error } = await supabaseAdmin
    .from("venue_owners")
    .select("id, auth_id, name, email")
    .eq("id", ownerId)
    .maybeSingle<OwnerAccountRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const authId = String(data.auth_id ?? "").trim();
  const email = normalizeOwnerEmail(String(data.email ?? ""));
  const name = String(data.name ?? "").trim();

  if (!authId || !email) {
    console.error("Owner account row is missing auth credentials.", {
      ownerId: data.id,
      hasAuthId: Boolean(authId),
      hasEmail: Boolean(email),
    });
    return null;
  }

  return {
    id: data.id,
    authId,
    name,
    email,
  };
}

export async function reauthenticateOwnerPassword(
  owner: OwnerAccountProfile,
  currentPassword: string,
): Promise<OwnerPasswordReauthResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Owner account reauthentication is missing Supabase public configuration.");
    return { ok: false, reason: "server_error" };
  }

  let authResponse: Response;
  try {
    authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ email: owner.email, password: currentPassword }),
    });
  } catch (error) {
    console.error(
      `Owner account reauthentication request failed for owner ${owner.id}:`,
      error instanceof Error ? error.message : String(error),
    );
    return { ok: false, reason: "server_error" };
  }

  if (!authResponse.ok) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const authData = (await authResponse.json().catch(() => ({}))) as { user?: { id?: string } };
  const authUserId = String(authData.user?.id ?? "").trim();

  if (!authUserId || authUserId !== owner.authId) {
    console.error("Owner account reauthentication returned an unexpected auth user.", {
      ownerId: owner.id,
      expectedAuthId: owner.authId,
      receivedAuthId: authUserId || null,
    });
    return { ok: false, reason: "server_error" };
  }

  return { ok: true };
}

export const isDuplicateOwnerEmailError = (message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("already") ||
    normalized.includes("duplicate") ||
    normalized.includes("exists") ||
    normalized.includes("registered")
  );
};
