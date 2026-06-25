import { NextResponse } from "next/server";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizePin } from "@/lib/pin";
import { logAuthIncident } from "@/lib/authIncidentDebug";
import { normalizeUsername, normalizeUsernameForLookup } from "@/lib/webauthn";
import { checkUsername } from "@/lib/usernameModerator";

type AccountBody = {
  username?: string;
  pin?: string;
  authUserId?: string;
  mode?: "login" | "create";
};

type AccountRow = {
  id: string;
  auth_id: string | null;
  username: string;
  username_normalized: string;
  pin_salt: string | null;
  pin_hash: string | null;
  god_mode: boolean;
  created_at: string;
};

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 64).toString("hex");
}

function verifyPin(pin: string, salt: string, hash: string): boolean {
  const computed = Buffer.from(hashPin(pin, salt), "hex");
  const expected = Buffer.from(hash, "hex");
  if (computed.length !== expected.length) return false;
  return timingSafeEqual(computed, expected);
}

function normalizeAuthUserId(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw) ? raw : null;
}

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as AccountBody;
  const username = normalizeUsername(body.username ?? "");
  const usernameNormalized = normalizeUsernameForLookup(username);
  const pin = normalizePin(body.pin ?? "");
  const authUserId = normalizeAuthUserId(body.authUserId);
  const mode = body.mode === "login" || body.mode === "create" ? body.mode : undefined;
  const traceId = String(request.headers.get("x-auth-trace-id") ?? "").trim() || null;
  const startedAt = Date.now();

  logAuthIncident("join-account-route", "post-start", { traceId, username });

  if (!username) {
    return NextResponse.json({ ok: false, error: "Username is required." }, { status: 400 });
  }
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ ok: false, error: "PIN must be exactly 4 digits." }, { status: 400 });
  }

  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("accounts")
    .select("id, auth_id, username, username_normalized, pin_salt, pin_hash, god_mode, created_at")
    .eq("username_normalized", usernameNormalized)
    .maybeSingle<AccountRow>();

  if (lookupError) {
    return NextResponse.json({ ok: false, error: lookupError.message }, { status: 500 });
  }

  if (existing) {
    const existingSalt = (existing.pin_salt ?? "").trim();
    const existingHash = (existing.pin_hash ?? "").trim();

    if (existingSalt && existingHash) {
      if (!verifyPin(pin, existingSalt, existingHash)) {
        logAuthIncident("join-account-route", "post-reject-incorrect-pin", {
          traceId,
          username,
          elapsedMs: Date.now() - startedAt,
        });
        return NextResponse.json({ ok: false, error: "Incorrect PIN." }, { status: 401 });
      }
    } else {
      const salt = randomBytes(16).toString("hex");
      const hash = hashPin(pin, salt);
      const { error: pinSetError } = await supabaseAdmin
        .from("accounts")
        .update({ pin_salt: salt, pin_hash: hash })
        .eq("id", existing.id);
      if (pinSetError) {
        return NextResponse.json({ ok: false, error: pinSetError.message }, { status: 500 });
      }
    }

    if (!existing.auth_id && authUserId) {
      await supabaseAdmin
        .from("accounts")
        .update({ auth_id: authUserId })
        .eq("id", existing.id)
        .is("auth_id", null);
    }

    logAuthIncident("join-account-route", "post-existing-account", {
      traceId,
      username,
      accountId: existing.id,
      elapsedMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      ok: true,
      account: {
        id: existing.id,
        username: existing.username,
        authId: existing.auth_id ?? undefined,
        godMode: existing.god_mode,
      },
    });
  }

  if (mode === "login") {
    return NextResponse.json(
      { ok: false, error: "We do not recognize that username/PIN combination, please go back and create an account with us." },
      { status: 401 }
    );
  }

  const moderationResult = await checkUsername(username);
  if (!moderationResult.allowed) {
    return NextResponse.json({ ok: false, error: moderationResult.reason }, { status: 422 });
  }

  const salt = randomBytes(16).toString("hex");
  const hash = hashPin(pin, salt);

  const { data: newAccount, error: insertError } = await supabaseAdmin
    .from("accounts")
    .insert({
      auth_id: authUserId,
      username,
      username_normalized: usernameNormalized,
      pin_salt: salt,
      pin_hash: hash,
    })
    .select("id, username, auth_id")
    .single<{ id: string; username: string; auth_id: string | null }>();

  if (insertError || !newAccount) {
    if ((insertError as { code?: string } | null)?.code === "23505") {
      return NextResponse.json({ ok: false, error: "That username is already taken." }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, error: insertError?.message ?? "Failed to create account." },
      { status: 500 }
    );
  }

  logAuthIncident("join-account-route", "post-created-account", {
    traceId,
    username,
    accountId: newAccount.id,
    elapsedMs: Date.now() - startedAt,
  });
  return NextResponse.json({
    ok: true,
    account: {
      id: newAccount.id,
      username: newAccount.username,
      authId: newAccount.auth_id ?? undefined,
      godMode: false,
    },
  });
}

export async function GET(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ ok: false, error: "Supabase admin client is not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const username = normalizeUsername(searchParams.get("username") ?? "");

  if (!username) {
    return NextResponse.json({ ok: false, error: "username is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("accounts")
    .select("id, pin_salt, pin_hash")
    .eq("username_normalized", normalizeUsernameForLookup(username))
    .maybeSingle<{ id?: string; pin_salt?: string | null; pin_hash?: string | null }>();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const exists = Boolean(data?.id);
  const hasPin = Boolean(String(data?.pin_salt ?? "").trim() && String(data?.pin_hash ?? "").trim());
  return NextResponse.json({ ok: true, exists, hasPin, isReturningUser: exists && hasPin });
}
